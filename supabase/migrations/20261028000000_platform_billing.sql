-- Cobrança da assinatura das locadoras (Frota Easy → locadora), recebida nas contas InfinitePay/Asaas da plataforma.
-- Faturas em platform_invoices; pagamento confirmado (webhook + consulta ao provedor) estende o período em 30 dias.
-- Escrita só service_role; a equipe da locadora lê as próprias faturas. Idempotente.
begin;

create table if not exists public.platform_invoices (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  plan_id             text not null references public.plans(id),
  amount_cents        int not null check (amount_cents between 100 and 10000000),
  provider            text not null check (provider in ('infinitepay', 'asaas')),
  status              text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  checkout_url        text,
  provider_payment_id text,
  handle              text,
  webhook_token       text,
  transaction_nsu     text,
  invoice_slug        text,
  last_error          text,
  paid_at             timestamptz,
  period_end          timestamptz,
  created_by          uuid,
  created_at          timestamptz not null default now()
);
create index if not exists platform_invoices_org_idx on public.platform_invoices (organization_id, created_at desc);
create unique index if not exists platform_invoices_provider_payment_uq on public.platform_invoices (provider, provider_payment_id) where provider_payment_id is not null;

alter table public.platform_invoices enable row level security;
revoke all on public.platform_invoices from anon, authenticated;
grant select (id, organization_id, plan_id, amount_cents, provider, status, checkout_url, paid_at, period_end, created_at)
  on public.platform_invoices to authenticated;
grant all on public.platform_invoices to service_role;
drop policy if exists platform_invoices_read on public.platform_invoices;
create policy platform_invoices_read on public.platform_invoices for select to authenticated
  using (organization_id = (select public.current_org_id()) or (select public.is_platform_admin()));

-- Baixa atômica: só a primeira confirmação vale (pending → paid). Estende a partir do fim atual (se no futuro) ou de agora.
create or replace function public.platform_invoice_paid(p_id uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare inv public.platform_invoices; v_end timestamptz;
begin
  update public.platform_invoices set status = 'paid', paid_at = now()
   where id = p_id and status = 'pending' returning * into inv;
  if not found then return null; end if;
  select greatest(coalesce(s.current_period_end, now()), now()) + interval '30 days' into v_end
    from public.subscriptions s where s.organization_id = inv.organization_id;
  v_end := coalesce(v_end, now() + interval '30 days');
  insert into public.subscriptions (organization_id, plan_id, current_period_end, provider, updated_at)
  values (inv.organization_id, inv.plan_id, v_end, inv.provider, now())
  on conflict (organization_id) do update set plan_id = excluded.plan_id, current_period_end = excluded.current_period_end,
    provider = excluded.provider, updated_at = now();
  update public.platform_invoices set period_end = v_end where id = p_id;
  update public.organizations set status = 'active', updated_at = now() where id = inv.organization_id and status <> 'cancelled';
  return v_end;
end $$;
revoke all on function public.platform_invoice_paid(uuid) from public, anon, authenticated;
grant execute on function public.platform_invoice_paid(uuid) to service_role;

-- Vencimento: teste vencido ou mensalidade vencida → pendente; após a carência → suspensa. Nada é apagado.
-- A locadora padrão da plataforma (LOCAKAR) nunca é alterada aqui.
create or replace function public.expire_trials() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int; b int; g int; d uuid;
begin
  select grace_days, default_organization_id into g, d from public.platform_config where id = 1;
  update public.organizations o set status = 'past_due', updated_at = now()
    from public.subscriptions s
   where s.organization_id = o.id and o.id is distinct from d
     and ((o.status = 'trial' and s.trial_ends_at < now() and (s.current_period_end is null or s.current_period_end < now()))
       or (o.status = 'active' and s.current_period_end is not null and s.current_period_end < now()));
  get diagnostics a = row_count;
  update public.organizations o set status = 'suspended', updated_at = now()
    from public.subscriptions s
   where s.organization_id = o.id and o.status = 'past_due' and o.id is distinct from d
     and coalesce(s.current_period_end, s.trial_ends_at) < now() - make_interval(days => coalesce(g, 7));
  get diagnostics b = row_count;
  return jsonb_build_object('past_due', a, 'suspended', b);
end $$;
revoke all on function public.expire_trials() from public, anon, authenticated;
grant execute on function public.expire_trials() to service_role;

commit;
