-- Copiloto LocaKar no WhatsApp (motor Whaileys, paralelo à Evolution). Somente backend (service_role).
begin;
create table if not exists public.copilot_config (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'hybrid' check (mode in ('buttons','hybrid')),
  level smallint not null default 1 check (level between 1 and 3),
  admin_phones text[] not null default '{}' check (array_position(admin_phones, null) is null),
  instance_key text not null unique check (instance_key ~ '^locakar_copilot_[0-9a-f-]{36}$'),
  connected_jid text,
  connected_lid text,
  updated_at timestamptz not null default now()
);

create table if not exists public.copilot_sessions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  step text not null default 'menu',
  data jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default now() + interval '30 minutes',
  primary key (organization_id, phone)
);

create table if not exists public.copilot_pending_actions (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admin_phone text not null,
  action_type text not null check (action_type in ('settle_receipt','create_expense','create_maintenance')),
  payload jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','CANCELLED','EXPIRED')),
  result jsonb,
  last_error text,
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists copilot_pending_org_idx on public.copilot_pending_actions (organization_id, admin_phone, created_at desc);

-- Mensagens: contexto curto, deduplicação de entrada e anti-loop (ids enviados pelo próprio backend).
create table if not exists public.copilot_messages (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  direction text not null check (direction in ('in','out')),
  provider_id text not null,
  kind text not null,
  text text,
  created_at timestamptz not null default now(),
  unique (organization_id, provider_id)
);
create index if not exists copilot_messages_phone_idx on public.copilot_messages (organization_id, phone, created_at desc);

do $$ declare t text; begin
  foreach t in array array['copilot_config','copilot_sessions','copilot_pending_actions','copilot_messages'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Clique duplo em Confirmar: só uma chamada vence. Expirada vira EXPIRED.
create or replace function public.claim_copilot_action(p_org uuid, p_id uuid, p_phone text, p_decision text)
returns jsonb language plpgsql security definer set search_path = '' as $claim$
declare a public.copilot_pending_actions;
begin
  if p_decision not in ('CONFIRMED','CANCELLED') then return jsonb_build_object('result','invalid'); end if;
  update public.copilot_pending_actions set status = 'EXPIRED', resolved_at = now()
   where id = p_id and organization_id = p_org and status = 'PENDING' and expires_at <= now();
  update public.copilot_pending_actions set status = p_decision, resolved_at = now()
   where id = p_id and organization_id = p_org and admin_phone = p_phone and status = 'PENDING'
   returning * into a;
  if found then return jsonb_build_object('result','claimed','type',a.action_type,'payload',a.payload); end if;
  select * into a from public.copilot_pending_actions where id = p_id and organization_id = p_org;
  if not found or a.admin_phone <> p_phone then return jsonb_build_object('result','not_found'); end if;
  return jsonb_build_object('result','already','status',a.status);
end $claim$;

-- Baixa de parcela dentro do JSON receipts com trava de linha (webhooks Asaas/InfinitePay concorrentes).
create or replace function public.settle_rental_receipt(p_org uuid, p_rental text, p_receipt text, p_amount numeric, p_method text, p_by text, p_paid_at date)
returns text language plpgsql security definer set search_path = '' as $settle$
declare r public.rentals; idx int; rec jsonb;
begin
  if p_amount is null or p_amount <= 0 then return 'invalid'; end if;
  select * into r from public.rentals where id = p_rental and organization_id = p_org for update;
  if not found then return 'not_found'; end if;
  select i - 1, e into idx, rec from jsonb_array_elements(r.receipts) with ordinality as x(e, i) where e->>'id' = p_receipt;
  if idx is null then return 'not_found'; end if;
  if coalesce((rec->>'paid')::boolean, false) then return 'already'; end if;
  if coalesce((rec->>'cancelled')::boolean, false) then return 'cancelled'; end if;
  update public.rentals set receipts = jsonb_set(receipts, array[idx::text],
    rec || jsonb_build_object('paid', true, 'paidAt', p_paid_at, 'amountPaid', p_amount, 'paymentMethod', p_method, 'settledBy', p_by)),
    updated_at = now()
   where id = p_rental and organization_id = p_org;
  return 'settled';
end $settle$;

revoke all on function public.claim_copilot_action(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.claim_copilot_action(uuid,uuid,text,text) to service_role;
revoke all on function public.settle_rental_receipt(uuid,text,text,numeric,text,text,date) from public, anon, authenticated;
grant execute on function public.settle_rental_receipt(uuid,text,text,numeric,text,text,date) to service_role;
commit;
