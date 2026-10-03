-- LOCAKAR SaaS — Super Admin: visão geral, equipe com e-mail, administradores, exclusão de locadora e auditoria.
-- Funções só para o servidor (service_role); a rota /api/platform/admin confere is_platform_admin() da sessão.

begin;

-- Trilha das ações do Super Admin. Sem FK em organization_id: o registro sobrevive à exclusão da locadora.
create table if not exists public.platform_audit (
  id              bigint generated always as identity primary key,
  actor_id        uuid,
  action          text not null,
  organization_id uuid,
  details         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists platform_audit_created_idx on public.platform_audit (created_at desc);
alter table public.platform_audit enable row level security;
revoke all on public.platform_audit from anon, authenticated;
grant all on public.platform_audit to service_role;

-- Todas as locadoras com plano, dono e contadores (uma consulta, sem N+1).
create or replace function public.platform_overview() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
    select o.id, o.slug, o.name, o.legal_name, o.document, o.email, o.phone, o.whatsapp, o.status, o.created_at,
           s.plan_id, s.trial_ends_at, s.current_period_end,
           (select u.email::text from public.memberships m join auth.users u on u.id = m.user_id
             where m.organization_id = o.id and m.role = 'owner' order by m.created_at limit 1) as owner_email,
           (select count(*) from public.memberships m where m.organization_id = o.id) as users,
           (select count(*) from public.vehicles v where v.organization_id = o.id) as vehicles,
           (select count(*) from public.clients c where c.organization_id = o.id) as clients,
           (select count(*) from public.rentals r where r.organization_id = o.id and r.status in ('active', 'late')) as active_rentals,
           (o.id = public.legacy_org_id()) as is_default
      from public.organizations o
      left join public.subscriptions s on s.organization_id = o.id) x;
$$;

create or replace function public.platform_org_members(p_org uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.created_at
    from public.memberships m join auth.users u on u.id = m.user_id
   where m.organization_id = p_org order by m.created_at;
$$;

create or replace function public.platform_admin_list()
returns table (user_id uuid, email text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.user_id, u.email::text, a.created_at
    from public.platform_admins a join auth.users u on u.id = a.user_id order by a.created_at;
$$;

create or replace function public.platform_user_id(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

-- Exclusão definitiva de uma locadora e de TODOS os dados dela. Transação única: falhou, nada muda.
-- Tabela nova com organization_id fora da lista = FK "restrict" aborta (fail-closed, nada é apagado pela metade).
create or replace function public.platform_delete_organization(p_org uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t text; n int; out jsonb := '{}'::jsonb;
begin
  if p_org = public.legacy_org_id() then
    raise exception 'A locadora principal da plataforma não pode ser excluída.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'Locadora não encontrada.' using errcode = 'P0002';
  end if;
  -- Filhos antes dos pais. Triggers desligados só nesta tabela e só neste comando
  -- (contracts_guard bloqueia excluir contrato assinado; aqui a locadora inteira sai).
  foreach t in array array[
    'email_log','contracts','payment_receipts','vehicle_incidents','tenant_devices','antifraud_telemetry',
    'tenant_consents','tenant_inspections','tenant_documents','rental_requests','payment_transactions',
    'asaas_customers','asaas_webhook_events','client_push_subscriptions','notifications','vehicle_fipe_history',
    'audit_log','selsyn_requests','fines','notes','expenses','maintenance','reservations','rentals',
    'contract_template_versions','contract_templates','contract_ai_config','asaas_config','settings',
    'clients','vehicles'] loop
    execute format('alter table public.%I disable trigger user', t);
    execute format('delete from public.%I where organization_id = $1', t) using p_org;
    get diagnostics n = row_count;
    execute format('alter table public.%I enable trigger user', t);
    if n > 0 then out := out || jsonb_build_object(t, n); end if;
  end loop;
  delete from public.organizations where id = p_org; -- membros, assinatura e convites: cascade
  return out;
end $$;

revoke all on function public.platform_overview(), public.platform_org_members(uuid), public.platform_admin_list(),
  public.platform_user_id(text), public.platform_delete_organization(uuid) from public, anon, authenticated;
grant execute on function public.platform_overview(), public.platform_org_members(uuid), public.platform_admin_list(),
  public.platform_user_id(text), public.platform_delete_organization(uuid) to service_role;

commit;
