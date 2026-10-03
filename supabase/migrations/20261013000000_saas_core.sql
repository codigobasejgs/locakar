-- LOCAKAR SaaS — Fase 1: núcleo multiempresa (ADITIVO: nenhuma tabela existente é alterada).
-- Cria organizações, membros, papéis, planos, assinaturas, convites e a organização LOCAKAR
-- com os dados atuais. Rodar ANTES do backfill (20261013000100). Idempotente.

begin;

-- ---------- Configuração da plataforma (uma linha) ----------
create table if not exists public.platform_config (
  id                      int primary key default 1 check (id = 1),
  default_organization_id uuid,       -- locadora dos dados/apps legados (LOCAKAR)
  trial_days              int not null default 30 check (trial_days between 0 and 365),
  grace_days              int not null default 7 check (grace_days between 0 and 90),
  updated_at              timestamptz not null default now()
);
insert into public.platform_config (id) values (1) on conflict (id) do nothing;

-- ---------- Organizações (locadoras) ----------
create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  name          text not null check (length(trim(name)) between 2 and 80),   -- nome fantasia exibido
  legal_name    text,
  document      text,                                                        -- CPF/CNPJ só dígitos
  email         text,
  phone         text,
  whatsapp      text,
  website       text,
  address       text,
  city          text,
  state         text check (state is null or state ~ '^[A-Z]{2}$'),
  cep           text,
  status        text not null default 'trial' check (status in ('active', 'trial', 'past_due', 'suspended', 'cancelled')),
  timezone      text not null default 'America/Sao_Paulo',
  locale        text not null default 'pt-BR',
  currency      text not null default 'BRL',
  branding      jsonb not null default '{}'::jsonb,   -- {displayName, primary, secondary, accent, theme, logo, logoCompact, favicon}
  texts         jsonb not null default '{}'::jsonb,   -- {welcome, billing, support, footer}
  onboarding    jsonb not null default '{}'::jsonb,   -- passos concluídos
  custom_domain text unique,                          -- reservado (domínio próprio futuro)
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- Membros da equipe e papéis ----------
create table if not exists public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'operator' check (role in ('owner', 'admin', 'manager', 'finance', 'operator', 'viewer')),
  invited_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships (user_id);

-- Locadora ativa de quem tem mais de um vínculo (validada contra memberships/clients no banco).
create table if not exists public.user_preferences (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  active_organization_id uuid references public.organizations(id) on delete set null,
  updated_at             timestamptz not null default now()
);

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_invites (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email           text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role            text not null check (role in ('admin', 'manager', 'finance', 'operator', 'viewer')),
  token_hash      text not null unique,             -- SHA-256 do token (o token só existe no link)
  invited_by      uuid references auth.users(id) on delete set null,
  expires_at      timestamptz not null default now() + interval '7 days',
  accepted_by     uuid references auth.users(id) on delete set null,
  accepted_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists organization_invites_org_idx on public.organization_invites (organization_id, created_at desc);

-- ---------- Planos e assinatura (sem preços: definidos depois) ----------
create table if not exists public.plans (
  id           text primary key check (id ~ '^[a-z0-9_-]{2,40}$'),
  name         text not null,
  entitlements jsonb not null default '{}'::jsonb,  -- {modules:{contracts:true,...}, maxVehicles, maxUsers, maxContractTemplates}
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
insert into public.plans (id, name, entitlements) values
  ('completo', 'Completo', '{"modules":{"reservations":true,"finance":true,"maintenance":true,"fines":true,"contracts":true,"inspections":true,"tracking":true,"fipe":true,"payments":true,"reports":true,"tenant_app":true},"maxVehicles":null,"maxUsers":null,"maxContractTemplates":5}'::jsonb),
  ('trial', 'Teste grátis', '{"modules":{"reservations":true,"finance":true,"maintenance":true,"fines":true,"contracts":true,"inspections":true,"tracking":false,"fipe":true,"payments":true,"reports":true,"tenant_app":true},"maxVehicles":null,"maxUsers":null,"maxContractTemplates":5}'::jsonb)
on conflict (id) do nothing;

create table if not exists public.subscriptions (
  organization_id          uuid primary key references public.organizations(id) on delete cascade,
  plan_id                  text not null references public.plans(id),
  trial_ends_at            timestamptz,
  current_period_end       timestamptz,
  provider                 text check (provider in ('asaas', 'infinitepay')),
  provider_subscription_id text,
  updated_at               timestamptz not null default now()
);

-- Limites de uso (cadastro público, convites): chave livre, janela deslizante.
create table if not exists public.rate_limits (
  key        text not null,
  hit_at     timestamptz not null default now()
);
create index if not exists rate_limits_key_idx on public.rate_limits (key, hit_at desc);

-- ---------- Funções de contexto (fonte única do tenant: banco, nunca o request) ----------
create or replace function public.legacy_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select default_organization_id from public.platform_config where id = 1;
$$;

-- Locadora atual da EQUIPE: a ativa (se ainda for membro) ou a primeira.
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.active_organization_id from public.user_preferences p
       join public.memberships m on m.organization_id = p.active_organization_id and m.user_id = p.user_id
      where p.user_id = (select auth.uid())),
    (select m.organization_id from public.memberships m where m.user_id = (select auth.uid()) order by m.created_at limit 1)
  );
$$;

create or replace function public.current_org_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.memberships where user_id = (select auth.uid()) and organization_id = public.current_org_id();
$$;

-- Escrita: membro não-leitor de locadora não suspensa/cancelada.
create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.organizations o on o.id = m.organization_id
     where m.user_id = (select auth.uid()) and m.organization_id = public.current_org_id()
       and m.role <> 'viewer' and o.status in ('active', 'trial', 'past_due'));
$$;

-- Configurações, equipe e integrações: só dono/administrador.
create or replace function public.can_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m join public.organizations o on o.id = m.organization_id
     where m.user_id = (select auth.uid()) and m.organization_id = public.current_org_id()
       and m.role in ('owner', 'admin') and o.status in ('active', 'trial', 'past_due'));
$$;

-- Uma chamada para o servidor: locadora atual, papel e status (requireStaff).
create or replace function public.current_membership() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('organization_id', m.organization_id, 'role', m.role, 'status', o.status)
    from public.memberships m join public.organizations o on o.id = m.organization_id
   where m.user_id = (select auth.uid()) and m.organization_id = public.current_org_id();
$$;
revoke all on function public.current_membership() from public, anon;
grant execute on function public.current_membership() to authenticated;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

-- Compatibilidade: "equipe" = tem locadora. As policies antigas continuam funcionando até a Fase 3.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_org_id() is not null;
$$;

-- Limite deslizante genérico. true = permitido (e registra o acesso).
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window interval) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('rl:' || p_key));
  delete from public.rate_limits where key = p_key and hit_at < now() - p_window;
  if (select count(*) from public.rate_limits where key = p_key) >= p_max then return false; end if;
  insert into public.rate_limits (key) values (p_key);
  return true;
end $$;

-- Entitlements efetivos da locadora (plano da assinatura).
create or replace function public.org_entitlements(p_org uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.entitlements from public.subscriptions s join public.plans p on p.id = s.plan_id where s.organization_id = p_org), '{}'::jsonb);
$$;

revoke all on function public.legacy_org_id(), public.current_org_id(), public.current_org_role(), public.can_write(),
  public.can_admin(), public.is_platform_admin(), public.is_staff(), public.org_entitlements(uuid) from public, anon;
grant execute on function public.current_org_id(), public.current_org_role(), public.can_write(), public.can_admin(),
  public.is_platform_admin(), public.is_staff() to authenticated;
grant execute on function public.legacy_org_id(), public.org_entitlements(uuid) to authenticated, service_role;
revoke all on function public.hit_rate_limit(text, int, interval) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, interval) to service_role;

-- ---------- RLS das tabelas novas ----------
do $$
declare t text;
begin
  foreach t in array array['platform_config','organizations','memberships','user_preferences','platform_admins',
                           'organization_invites','plans','subscriptions','rate_limits'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Membro lê a própria locadora e a lista da equipe. Escritas: só pelo servidor (validação + auditoria).
drop policy if exists org_member_read on public.organizations;
create policy org_member_read on public.organizations for select to authenticated
  using (id in (select organization_id from public.memberships where user_id = (select auth.uid())) or (select public.is_platform_admin()));
grant select on public.organizations to authenticated;

drop policy if exists org_member_read on public.memberships;
create policy org_member_read on public.memberships for select to authenticated
  using (organization_id = (select public.current_org_id()) or user_id = (select auth.uid()));
grant select on public.memberships to authenticated;

drop policy if exists own_preferences on public.user_preferences;
create policy own_preferences on public.user_preferences for select to authenticated using (user_id = (select auth.uid()));
grant select on public.user_preferences to authenticated;

drop policy if exists org_member_read on public.subscriptions;
create policy org_member_read on public.subscriptions for select to authenticated
  using (organization_id = (select public.current_org_id()) or (select public.is_platform_admin()));
grant select on public.subscriptions to authenticated;

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select to authenticated using (true);
grant select on public.plans to authenticated;

drop policy if exists invites_admin_read on public.organization_invites;
create policy invites_admin_read on public.organization_invites for select to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.can_admin()));
grant select (id, organization_id, email, role, invited_by, expires_at, accepted_by, accepted_at, revoked_at, created_at)
  on public.organization_invites to authenticated;

drop trigger if exists set_updated_at on public.organizations;
create trigger set_updated_at before update on public.organizations for each row execute function public.set_updated_at();

-- ---------- Organização LOCAKAR com os dados atuais ----------
do $$
declare v_org uuid; c jsonb;
begin
  select default_organization_id into v_org from public.platform_config where id = 1;
  if v_org is null then
    select coalesce(data -> 'company', '{}'::jsonb) into c from public.settings where id = 1;
    c := coalesce(c, '{}'::jsonb);
    insert into public.organizations (slug, name, legal_name, document, email, address, status, branding)
    values ('locakar', 'LOCAKAR', nullif(c ->> 'legalName', ''), nullif(regexp_replace(coalesce(c ->> 'cnpj', ''), '\D', '', 'g'), ''),
            nullif(c ->> 'email', ''), nullif(c ->> 'address', ''), 'active',
            '{"displayName":"LOCAKAR","primary":"#8b008b","secondary":"#600060","accent":"#a000a0","theme":"dark","logo":"/logos/locakar-logo.png","logoLight":"/logos/locakar-logo-light.png","logoCompact":"/logos/locakar-circular.png"}'::jsonb)
    on conflict (slug) do update set slug = excluded.slug
    returning id into v_org;
    update public.platform_config set default_organization_id = v_org, updated_at = now() where id = 1;
  end if;

  -- Equipe atual vira dona da LOCAKAR e administradora da plataforma.
  insert into public.memberships (organization_id, user_id, role)
  select v_org, user_id, 'owner' from public.staff on conflict do nothing;
  insert into public.platform_admins (user_id) select user_id from public.staff on conflict do nothing;
  insert into public.subscriptions (organization_id, plan_id) values (v_org, 'completo') on conflict do nothing;
end $$;

-- Novos membros da equipe entram por convite (Configurações → Equipe). A tabela staff fica só como histórico.
commit;
