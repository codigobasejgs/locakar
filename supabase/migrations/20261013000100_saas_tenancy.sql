-- LOCAKAR SaaS — Fase 2/3: organization_id em todas as tabelas da locadora, backfill LOCAKAR,
-- unicidade por locadora, RLS por organização, Storage e RPCs tenant-aware.
-- O código antigo continua funcionando (dados novos sem organização caem na LOCAKAR enquanto
-- platform_config.legacy_fallback = true; 20261013000200 desliga isso após o deploy do código novo).
-- A transação aborta sozinha se qualquer contagem divergir ou sobrar registro sem organização.

begin;

alter table public.platform_config add column if not exists legacy_fallback boolean not null default true;

create table if not exists public.saas_migration_counts (
  table_name   text primary key,
  before_count bigint not null,
  after_count  bigint not null,
  null_count   bigint not null,
  checked_at   timestamptz not null default now()
);
alter table public.saas_migration_counts enable row level security;
revoke all on public.saas_migration_counts from anon, authenticated;

-- ============================================================================
-- 1. Coluna + backfill + verificação de contagens
-- ============================================================================
do $$
declare
  t text; b bigint; a bigint; n bigint; v_org uuid := public.legacy_org_id();
begin
  if v_org is null then raise exception 'Organização LOCAKAR ausente: rode 20261013000000_saas_core.sql antes.'; end if;
  foreach t in array array[
    'vehicles','clients','rentals','reservations','expenses','maintenance','fines','notes',
    'contracts','email_log','contract_templates','contract_template_versions','contract_ai_config',
    'payment_receipts','vehicle_incidents','tenant_devices','antifraud_telemetry','tenant_consents',
    'tenant_inspections','tenant_documents','rental_requests',
    'payment_transactions','asaas_config','asaas_customers','asaas_webhook_events',
    'notifications','client_push_subscriptions','vehicle_fipe_history','audit_log','selsyn_requests','settings'] loop
    execute format('select count(*) from public.%I', t) into b;
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id) on delete restrict', t);
    -- Triggers do usuário desligados só durante o backfill: contracts_guard bloqueia qualquer UPDATE em
    -- contrato assinado e set_updated_at mudaria a data de todos os registros. Religados logo em seguida.
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set organization_id = $1 where organization_id is null', t) using v_org;
    execute format('alter table public.%I enable trigger user', t);
    execute format('select count(*), count(*) filter (where organization_id is null) from public.%I', t) into a, n;
    if a <> b or n > 0 then
      raise exception 'Backfill de % falhou: antes=% depois=% sem_org=%', t, b, a, n;
    end if;
    execute format('alter table public.%I alter column organization_id set not null', t);
    execute format('create index if not exists %I on public.%I (organization_id)', t || '_org_idx', t);
    insert into public.saas_migration_counts (table_name, before_count, after_count, null_count)
    values (t, b, a, n)
    on conflict (table_name) do update set before_count = excluded.before_count, after_count = excluded.after_count,
      null_count = excluded.null_count, checked_at = now();
  end loop;
end $$;

grant select (organization_id) on public.payment_transactions to authenticated;

-- ============================================================================
-- 2. Organização herdada do registro pai (fail-closed contra mistura de locadoras)
-- ============================================================================
-- Ordem: valor explícito → organização do pai → locadora da sessão → (transição) LOCAKAR.
-- Pai de outra locadora = erro. Organização nunca muda depois de criada.
create or replace function public.inherit_org() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  spec text; parent text; col text; val text; porg uuid; j jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' and new.organization_id is distinct from old.organization_id then
    raise exception 'A locadora de um registro não pode ser alterada.' using errcode = '42501';
  end if;
  foreach spec in array coalesce(tg_argv, '{}'::text[]) loop
    parent := split_part(spec, ':', 1);
    col := split_part(spec, ':', 2);
    val := j ->> col;
    continue when val is null;
    execute format('select organization_id from public.%I where id::text = $1', parent) into porg using val;
    continue when porg is null;
    if new.organization_id is null then
      new.organization_id := porg;
    elsif new.organization_id <> porg then
      raise exception 'Registro vinculado a outra locadora (%).', parent using errcode = '42501';
    end if;
  end loop;
  if new.organization_id is null then new.organization_id := public.current_org_id(); end if;
  if new.organization_id is null and coalesce((select legacy_fallback from public.platform_config where id = 1), false) then
    new.organization_id := public.legacy_org_id();
  end if;
  return new;
end $$;
revoke all on function public.inherit_org() from public, anon, authenticated;

do $$
declare r record;
begin
  for r in select * from (values
    ('vehicles', ''), ('clients', ''),
    ('rentals', '''clients:client_id'',''vehicles:vehicle_id'''),
    ('reservations', '''clients:client_id'',''vehicles:vehicle_id'''),
    ('expenses', '''vehicles:vehicle_id'''),
    ('maintenance', '''vehicles:vehicle_id'''),
    ('fines', '''clients:client_id'',''vehicles:vehicle_id'''),
    ('notes', '''clients:client_id'''),
    ('contracts', '''rentals:rental_id'',''contract_templates:template_id'''),
    ('email_log', '''rentals:rental_id'',''fines:fine_id'',''contracts:contract_id'''),
    ('contract_templates', ''),
    ('contract_template_versions', '''contract_templates:template_id'''),
    ('contract_ai_config', ''),
    ('payment_receipts', '''rentals:rental_id'',''clients:client_id'''),
    ('vehicle_incidents', '''rentals:rental_id'',''clients:client_id'',''vehicles:vehicle_id'''),
    ('tenant_devices', '''clients:client_id'''),
    ('antifraud_telemetry', '''clients:client_id'''),
    ('tenant_consents', '''clients:client_id'''),
    ('tenant_inspections', '''rentals:rental_id'',''clients:client_id'',''vehicles:vehicle_id'''),
    ('tenant_documents', '''clients:client_id'''),
    ('rental_requests', '''clients:client_id'',''vehicles:vehicle_id'',''rentals:created_rental_id'''),
    ('payment_transactions', '''rentals:rental_id'',''clients:client_id'''),
    ('asaas_config', ''), ('asaas_customers', '''clients:client_id'''), ('asaas_webhook_events', ''),
    ('notifications', ''), ('client_push_subscriptions', '''clients:client_id'''),
    ('vehicle_fipe_history', '''vehicles:vehicle_id'''),
    ('audit_log', ''), ('selsyn_requests', ''), ('settings', '')
  ) as x(t, args) loop
    execute format('drop trigger if exists a_inherit_org on public.%I', r.t);
    execute format('create trigger a_inherit_org before insert or update on public.%I for each row execute function public.inherit_org(%s)', r.t, r.args);
  end loop;
end $$;

-- ============================================================================
-- 3. Unicidade por locadora (mais fraca que a global: nunca falha com os dados atuais)
-- ============================================================================
alter table public.vehicles drop constraint if exists vehicles_plate_key;
create unique index if not exists vehicles_org_plate_key on public.vehicles (organization_id, plate);
drop index if exists public.vehicles_chassis_unique_idx;
create unique index if not exists vehicles_org_chassis_key on public.vehicles (organization_id, upper(trim(chassis)))
  where chassis is not null and trim(chassis) <> '';
drop index if exists public.vehicles_selsyn_id_unique;
create unique index if not exists vehicles_org_selsyn_key on public.vehicles (organization_id, selsyn_rastreavel_id)
  where selsyn_rastreavel_id is not null;

alter table public.clients drop constraint if exists clients_code_key;
alter table public.clients drop constraint if exists clients_cpf_key;
alter table public.clients drop constraint if exists clients_user_id_key;
create unique index if not exists clients_org_code_key on public.clients (organization_id, code);
create unique index if not exists clients_org_cpf_key on public.clients (organization_id, cpf);
create unique index if not exists clients_org_user_key on public.clients (organization_id, user_id) where user_id is not null;

alter table public.fines drop constraint if exists fines_notice_number_key;
create unique index if not exists fines_org_notice_key on public.fines (organization_id, notice_number);
-- notifications.dedupe_key segue único global (o código antigo usa onConflict "dedupe_key");
-- o código novo prefixa a chave com o id da locadora.

-- Código do cliente sequencial por locadora (sem corrida do max+1 do navegador).
create or replace function public.assign_client_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.code is null or exists (select 1 from public.clients where organization_id = new.organization_id and code = new.code) then
    perform pg_advisory_xact_lock(hashtext('clients.code:' || new.organization_id::text));
    select coalesce(max(code), 0) + 1 into new.code from public.clients where organization_id = new.organization_id;
  end if;
  return new;
end $$;
drop trigger if exists b_assign_client_code on public.clients;
create trigger b_assign_client_code before insert on public.clients for each row execute function public.assign_client_code();

-- ============================================================================
-- 4. Configurações por locadora (deixam de ser linha única id=1; a LOCAKAR mantém id=1)
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['settings', 'asaas_config', 'contract_ai_config'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_id_check');
    if (select attidentity from pg_attribute where attrelid = ('public.' || t)::regclass and attname = 'id') = '' then
      execute format('alter table public.%I alter column id drop default', t);
      execute format('alter table public.%I alter column id add generated by default as identity (start with 1000)', t);
    end if;
    execute format('create unique index if not exists %I on public.%I (organization_id)', t || '_org_key', t);
  end loop;
end $$;

-- ============================================================================
-- 5. Limites do plano (entitlements) validados no banco
-- ============================================================================
create or replace function public.enforce_plan_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int; n int; k text := tg_argv[0];
begin
  lim := nullif(public.org_entitlements(new.organization_id) ->> k, '')::int;
  if lim is null then return new; end if;
  execute format('select count(*) from public.%I where organization_id = $1', tg_table_name) into n using new.organization_id;
  if n >= lim then
    raise exception 'Limite do plano atingido (%: %). Fale com o suporte para ampliar.', k, lim using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists b_plan_limit on public.vehicles;
create trigger b_plan_limit before insert on public.vehicles for each row execute function public.enforce_plan_limit('maxVehicles');
drop trigger if exists b_plan_limit on public.contract_templates;
create trigger b_plan_limit before insert on public.contract_templates for each row execute function public.enforce_plan_limit('maxContractTemplates');
drop trigger if exists b_plan_limit on public.memberships;
create trigger b_plan_limit before insert on public.memberships for each row execute function public.enforce_plan_limit('maxUsers');

-- ============================================================================
-- 6. RLS por organização (substitui equipe_total = is_staff())
-- ============================================================================
do $$
declare t text;
begin
  -- Equipe lê e grava (gravação: papel ≠ leitor e locadora ativa)
  foreach t in array array['vehicles','clients','rentals','reservations','expenses','maintenance','fines','notes',
                           'contracts','email_log','contract_templates','contract_template_versions',
                           'payment_receipts','vehicle_incidents','tenant_devices','antifraud_telemetry','tenant_consents',
                           'tenant_inspections','tenant_documents','rental_requests'] loop
    execute format('drop policy if exists "equipe_total" on public.%I', t);
    execute format('drop policy if exists "equipe_total_rental_requests" on public.%I', t);
    execute format('drop policy if exists org_read on public.%I', t);
    execute format('drop policy if exists org_insert on public.%I', t);
    execute format('drop policy if exists org_update on public.%I', t);
    execute format('drop policy if exists org_delete on public.%I', t);
    execute format('create policy org_read on public.%I for select to authenticated using (organization_id = (select public.current_org_id()))', t);
    execute format('create policy org_insert on public.%I for insert to authenticated with check (organization_id = (select public.current_org_id()) and (select public.can_write()))', t);
    execute format('create policy org_update on public.%I for update to authenticated using (organization_id = (select public.current_org_id()) and (select public.can_write())) with check (organization_id = (select public.current_org_id()) and (select public.can_write()))', t);
    execute format('create policy org_delete on public.%I for delete to authenticated using (organization_id = (select public.current_org_id()) and (select public.can_write()))', t);
  end loop;

  -- Equipe só lê (gravação pelo servidor)
  foreach t in array array['notifications','client_push_subscriptions','payment_transactions','audit_log','vehicle_fipe_history'] loop
    execute format('drop policy if exists "equipe_le" on public.%I', t);
    execute format('drop policy if exists "equipe_le_auditoria" on public.%I', t);
    execute format('drop policy if exists org_read on public.%I', t);
    execute format('create policy org_read on public.%I for select to authenticated using (organization_id = (select public.current_org_id()))', t);
  end loop;
end $$;

-- Configurações: equipe lê; só dono/administrador grava.
drop policy if exists "equipe_total" on public.settings;
drop policy if exists org_read on public.settings;
drop policy if exists org_admin_insert on public.settings;
drop policy if exists org_admin_update on public.settings;
create policy org_read on public.settings for select to authenticated using (organization_id = (select public.current_org_id()));
create policy org_admin_insert on public.settings for insert to authenticated with check (organization_id = (select public.current_org_id()) and (select public.can_admin()));
create policy org_admin_update on public.settings for update to authenticated
  using (organization_id = (select public.current_org_id()) and (select public.can_admin()))
  with check (organization_id = (select public.current_org_id()) and (select public.can_admin()));
revoke delete on public.settings from authenticated;

-- ============================================================================
-- 7. Locatário: cliente da locadora ativa; vínculo restrito à locadora pedida
-- ============================================================================
create or replace function public.current_client_id() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.id from public.clients c
       join public.user_preferences p on p.user_id = c.user_id and p.active_organization_id = c.organization_id
      where c.user_id = (select auth.uid())),
    (select c.id from public.clients c where c.user_id = (select auth.uid()) order by c.created_at limit 1));
$$;

create or replace function public.set_active_organization(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Sessão expirada.' using errcode = '42501'; end if;
  if not exists (select 1 from public.memberships where user_id = (select auth.uid()) and organization_id = p_org)
     and not exists (select 1 from public.clients where user_id = (select auth.uid()) and organization_id = p_org) then
    raise exception 'Você não tem acesso a esta locadora.' using errcode = '42501';
  end if;
  insert into public.user_preferences (user_id, active_organization_id) values ((select auth.uid()), p_org)
  on conflict (user_id) do update set active_organization_id = excluded.active_organization_id, updated_at = now();
end $$;
revoke all on function public.set_active_organization(uuid) from public, anon;
grant execute on function public.set_active_organization(uuid) to authenticated;

-- Locadoras em que o usuário é locatário (seletor do app).
create or replace function public.my_tenant_organizations() returns table (id uuid, slug text, name text, branding jsonb)
language sql stable security definer set search_path = '' as $$
  select o.id, o.slug, o.name, o.branding from public.organizations o
   where o.id in (select organization_id from public.clients where user_id = (select auth.uid()))
   order by o.name;
$$;
revoke all on function public.my_tenant_organizations() from public, anon;
grant execute on function public.my_tenant_organizations() to authenticated;

drop function if exists public.ensure_client_for_current_user();
create or replace function public.ensure_client_for_current_user(p_org_slug text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  u auth.users; v_org uuid; v_id text; v_cpf text; v_name text; v_phone text;
begin
  select * into u from auth.users where id = (select auth.uid());
  if u.id is null or u.email_confirmed_at is null or coalesce(u.email, '') = '' then return null; end if;

  if p_org_slug is null then
    v_id := public.current_client_id();
    if v_id is not null then return v_id; end if;
    v_org := public.legacy_org_id();
  else
    select id into v_org from public.organizations where slug = lower(p_org_slug) and status in ('active', 'trial', 'past_due');
    if v_org is null then return null; end if;
    select id into v_id from public.clients where user_id = u.id and organization_id = v_org;
  end if;

  if v_id is null then
    v_cpf := regexp_replace(coalesce(u.raw_user_meta_data->>'cpf', ''), '\D', '', 'g');
    if length(v_cpf) <> 11 then return null; end if;
    v_name := coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1));
    v_phone := coalesce(nullif(trim(u.raw_user_meta_data->>'phone'), ''), '');

    update public.clients set user_id = u.id, updated_at = now()
     where organization_id = v_org and user_id is null
       and lower(email) = lower(u.email) and regexp_replace(cpf, '\D', '', 'g') = v_cpf
    returning id into v_id;

    if v_id is null then
      if exists (select 1 from public.clients where organization_id = v_org and regexp_replace(cpf, '\D', '', 'g') = v_cpf) then
        return null;   -- CPF já cadastrado com outro e-mail: a locadora confere
      end if;
      insert into public.clients (organization_id, name, email, phone, cpf, user_id, registered_at)
      values (v_org, v_name, u.email, v_phone, v_cpf, u.id, current_date)
      returning id into v_id;
    end if;
  end if;

  insert into public.user_preferences (user_id, active_organization_id) values (u.id, v_org)
  on conflict (user_id) do update set active_organization_id = excluded.active_organization_id, updated_at = now();
  return v_id;
end $$;
revoke all on function public.ensure_client_for_current_user(text) from public, anon;
grant execute on function public.ensure_client_for_current_user(text) to authenticated;

drop function if exists public.link_current_user_to_client();
create or replace function public.link_current_user_to_client(p_org_slug text default null) returns text
language sql security definer set search_path = '' as $$
  select public.ensure_client_for_current_user(p_org_slug);
$$;
revoke all on function public.link_current_user_to_client(text) from public, anon;
grant execute on function public.link_current_user_to_client(text) to authenticated;

-- Frota para reserva: só da locadora do cliente.
create or replace view public.tenant_fleet as
  select v.id, v.name, v.brand, v.model, v.year, v.image, v.category, v.transmission, v.fuel, v.seats,
         v.air_conditioning, v.daily_rate, v.weekly_rate
    from public.vehicles v
   where v.status <> 'sold'
     and v.organization_id = (select c.organization_id from public.clients c where c.id = public.current_client_id());

-- Antifraude compara comprovantes só dentro da mesma locadora.
create or replace function public.duplicate_proofs_count(p_client_id text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.payment_receipts a
   where a.client_id = p_client_id and a.proof_sha256 is not null
     and exists (select 1 from public.payment_receipts b
                  where b.proof_sha256 = a.proof_sha256 and b.id <> a.id and b.organization_id = a.organization_id);
$$;
revoke all on function public.duplicate_proofs_count(text) from public, anon, authenticated;

-- ============================================================================
-- 8. Cadastro de locadora (self-service) e convites — chamados só pelo servidor
-- ============================================================================
create or replace function public.create_organization(p_user uuid, p_name text, p_slug text, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_trial int; u auth.users;
begin
  select * into u from auth.users where id = p_user;
  if u.id is null or u.email_confirmed_at is null then raise exception 'Confirme seu e-mail antes de criar a locadora.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.organizations where created_by = p_user) then
    raise exception 'Você já criou uma locadora nesta conta.' using errcode = 'P0001';
  end if;
  if p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then raise exception 'Endereço inválido.' using errcode = 'P0001'; end if;
  if exists (select 1 from public.organizations where slug = p_slug) then raise exception 'Este endereço já está em uso.' using errcode = '23505'; end if;
  select trial_days into v_trial from public.platform_config where id = 1;

  insert into public.organizations (slug, name, email, phone, whatsapp, status, created_by, branding)
  values (p_slug, trim(p_name), u.email, p_phone, p_phone, 'trial', p_user,
          jsonb_build_object('displayName', trim(p_name), 'primary', '#2563eb', 'secondary', '#1e3a8a', 'accent', '#0ea5e9', 'theme', 'system'))
  returning id into v_org;
  insert into public.memberships (organization_id, user_id, role) values (v_org, p_user, 'owner');
  insert into public.subscriptions (organization_id, plan_id, trial_ends_at) values (v_org, 'trial', now() + make_interval(days => coalesce(v_trial, 30)));
  insert into public.settings (organization_id, data) values (v_org, '{}'::jsonb);
  insert into public.asaas_config (organization_id) values (v_org);
  insert into public.contract_ai_config (organization_id) values (v_org);
  insert into public.user_preferences (user_id, active_organization_id) values (p_user, v_org)
  on conflict (user_id) do update set active_organization_id = excluded.active_organization_id, updated_at = now();
  return v_org;
end $$;

create or replace function public.accept_invite(p_user uuid, p_email text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare i public.organization_invites;
begin
  select * into i from public.organization_invites
   where token_hash = p_token_hash and revoked_at is null and accepted_at is null and expires_at > now()
   for update;
  if not found then raise exception 'Convite inválido ou expirado.' using errcode = 'P0002'; end if;
  if lower(i.email) <> lower(coalesce(p_email, '')) then
    raise exception 'Este convite foi enviado para outro e-mail.' using errcode = '42501';
  end if;
  insert into public.memberships (organization_id, user_id, role, invited_by)
  values (i.organization_id, p_user, i.role, i.invited_by) on conflict (organization_id, user_id) do nothing;
  update public.organization_invites set accepted_by = p_user, accepted_at = now() where id = i.id;
  insert into public.user_preferences (user_id, active_organization_id) values (p_user, i.organization_id)
  on conflict (user_id) do update set active_organization_id = excluded.active_organization_id, updated_at = now();
  return i.organization_id;
end $$;

-- Teste grátis vencido → pendente de pagamento; após a carência → suspensa. Nada é apagado.
create or replace function public.expire_trials() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a int; b int; g int;
begin
  select grace_days into g from public.platform_config where id = 1;
  update public.organizations o set status = 'past_due'
    from public.subscriptions s
   where s.organization_id = o.id and o.status = 'trial' and s.trial_ends_at < now()
     and (s.current_period_end is null or s.current_period_end < now());
  get diagnostics a = row_count;
  update public.organizations o set status = 'suspended'
    from public.subscriptions s
   where s.organization_id = o.id and o.status = 'past_due'
     and coalesce(s.current_period_end, s.trial_ends_at) < now() - make_interval(days => coalesce(g, 7));
  get diagnostics b = row_count;
  return jsonb_build_object('past_due', a, 'suspended', b);
end $$;

revoke all on function public.create_organization(uuid, text, text, text), public.accept_invite(uuid, text, text),
  public.expire_trials() from public, anon, authenticated;
grant execute on function public.create_organization(uuid, text, text, text), public.accept_invite(uuid, text, text),
  public.expire_trials() to service_role;

-- ============================================================================
-- 9. RPCs de integrações por locadora (as antigas seguem até 20261013000200)
-- ============================================================================
create or replace function public.set_payment_method_enabled(p_org uuid, p_method text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if p_method not in ('pix_manual', 'infinitepay') or p_enabled is null or p_org is null then raise exception 'Meio inválido'; end if;
  k := case when p_method = 'pix_manual' then 'pix' else 'infinitepay' end;
  update public.settings set data = jsonb_set(data, array[k], coalesce(data -> k, '{}'::jsonb) || jsonb_build_object('enabled', p_enabled), true)
   where organization_id = p_org;
  if not found then raise exception 'Settings ausente'; end if;
end $$;
revoke all on function public.set_payment_method_enabled(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_payment_method_enabled(uuid, text, boolean) to service_role;

create or replace function public.reserve_selsyn_request(p_org uuid, p_id uuid, p_operator uuid, p_operation text, p_hash text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('selsyn:' || p_org::text));
  delete from public.selsyn_requests where created_at < now() - interval '1 day';
  if exists (select 1 from public.selsyn_requests where id = p_id) then return 'duplicate'; end if;
  if exists (select 1 from public.selsyn_requests where operator_id = p_operator and status = 'running' and created_at > now() - interval '35 seconds') then return 'busy'; end if;
  if exists (select 1 from public.selsyn_requests where operator_id = p_operator and input_hash = p_hash and operation_id = p_operation and created_at > now() - interval '5 seconds') then return 'duplicate'; end if;
  if (select count(*) from public.selsyn_requests where operator_id = p_operator and created_at > now() - interval '1 minute') >= 15
     or (select count(*) from public.selsyn_requests where organization_id = p_org and created_at > now() - interval '1 minute') >= 60 then return 'limited'; end if;
  insert into public.selsyn_requests (id, organization_id, operator_id, operation_id, input_hash) values (p_id, p_org, p_operator, p_operation, p_hash);
  return 'reserved';
end $$;
revoke all on function public.reserve_selsyn_request(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.reserve_selsyn_request(uuid, uuid, uuid, text, text) to service_role;


-- ============================================================================
-- 10. Assinatura pública: marca da locadora do contrato
-- ============================================================================
create or replace function public.contract_for_signing(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', c.status, 'content', c.content, 'contentHash', c.content_hash,
    'clientName', c.client_name, 'companySigner', c.company_signer, 'companySignature', c.company_signature,
    'issuedAt', c.issued_at, 'expiresAt', c.expires_at,
    'signedName', c.signed_name, 'signature', c.signature, 'signedAt', c.signed_at, 'signedIp', c.signed_ip,
    'brand', jsonb_build_object('name', coalesce(o.branding ->> 'displayName', o.name), 'logo', o.branding ->> 'logo',
                                'primary', o.branding ->> 'primary', 'whatsapp', o.whatsapp, 'email', o.email))
  from public.contracts c join public.organizations o on o.id = c.organization_id
  where length(coalesce(p_token, '')) >= 32 and c.token = p_token;
$$;

create or replace function public.sign_contract(
  p_token text, p_name text, p_cpf text, p_signature text, p_selfie text, p_ip text, p_user_agent text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v_phone text;
begin
  if length(coalesce(p_token, '')) < 32 then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  select * into c from public.contracts where token = p_token for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  if c.status = 'signed' then raise exception 'Este contrato já foi assinado.' using errcode = 'P0001'; end if;
  if c.status <> 'pending' then raise exception 'Este contrato foi cancelado pela locadora.' using errcode = 'P0001'; end if;
  if c.expires_at is not null and c.expires_at < now() then
    raise exception 'O link de assinatura expirou. Peça um novo link à locadora.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_name, ''))) < 5 then raise exception 'Informe seu nome completo.' using errcode = 'P0001'; end if;
  if regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') <> regexp_replace(c.client_cpf, '\D', '', 'g') then
    raise exception 'O CPF informado não confere com o do contrato.' using errcode = 'P0001';
  end if;
  if p_selfie is null or p_selfie not like 'data:image/jpeg;base64,%' or length(p_selfie) < 2000 or length(p_selfie) > 600000 then
    raise exception 'Tire a selfie pela câmera para confirmar sua identidade.' using errcode = 'P0001';
  end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 400000 then
    raise exception 'Assinatura inválida. Desenhe novamente.' using errcode = 'P0001';
  end if;

  update public.contracts set
    status = 'signed', signed_name = trim(p_name), signed_cpf = c.client_cpf, signature = p_signature, selfie = p_selfie,
    signed_at = now(), signed_ip = left(p_ip, 64), signed_user_agent = left(p_user_agent, 400)
  where id = c.id;

  select cl.phone into v_phone from public.rentals r join public.clients cl on cl.id = r.client_id where r.id = c.rental_id;

  return jsonb_build_object(
    'id', c.id, 'organizationId', c.organization_id, 'rentalId', c.rental_id, 'clientName', c.client_name, 'clientEmail', c.client_email,
    'clientPhone', v_phone, 'companyEmail', c.company_email, 'contentHash', c.content_hash,
    'signedName', trim(p_name), 'signedAt', now());
end $$;
revoke all on function public.sign_contract(text, text, text, text, text, text, text) from public;
grant execute on function public.sign_contract(text, text, text, text, text, text, text) to anon, authenticated;

-- ============================================================================
-- 11. Storage por locadora
-- ============================================================================
-- Locadora dona de um arquivo pelo 1º segmento: id da locadora (novos uploads), id de cliente ou
-- locação (uploads do app) ou, sem pasta reconhecível, LOCAKAR (arquivos legados). Uuid desconhecido = ninguém.
create or replace function public.storage_path_org(p_name text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare seg text := split_part(coalesce(p_name, ''), '/', 1); o uuid;
begin
  if position('/' in coalesce(p_name, '')) = 0 then return public.legacy_org_id(); end if;
  if seg ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into o from public.organizations where id = seg::uuid;
    if o is not null then return o; end if;
  end if;
  select organization_id into o from public.clients where id = seg;
  if o is null then select organization_id into o from public.rentals where id = seg; end if;
  if o is not null then return o; end if;
  -- uuid desconhecido = ninguém (evita "adotar" pastas de locadora apagada); demais = pasta legada da LOCAKAR
  if seg ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' then return null; end if;
  return public.legacy_org_id();
end $$;
revoke all on function public.storage_path_org(text) from public, anon;
grant execute on function public.storage_path_org(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "branding_publico_le" on storage.objects;
create policy "branding_publico_le" on storage.objects for select to public using (bucket_id = 'branding');

drop policy if exists "veiculos_equipe_gerencia" on storage.objects;
create policy "veiculos_equipe_gerencia" on storage.objects for all to authenticated
  using (bucket_id = 'veiculos' and public.storage_path_org(name) = (select public.current_org_id()) and (select public.can_write()))
  with check (bucket_id = 'veiculos' and public.storage_path_org(name) = (select public.current_org_id()) and (select public.can_write()));

do $$
declare b text;
begin
  foreach b in array array['documentos', 'comprovantes', 'ocorrencias', 'vistorias'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_le');
    execute format('drop policy if exists %I on storage.objects', b || '_equipe_le');
    execute format('drop policy if exists %I on storage.objects', b || '_equipe_grava');
    execute format('drop policy if exists %I on storage.objects', b || '_equipe_altera');
    execute format('drop policy if exists %I on storage.objects', b || '_equipe_apaga');
    execute format('drop policy if exists %I on storage.objects', b || '_equipe_gerencia');
    execute format('create policy %I on storage.objects for select to authenticated using (bucket_id = %L and public.storage_path_org(name) = (select public.current_org_id()))', b || '_equipe_le', b);
    execute format('create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and public.storage_path_org(name) = (select public.current_org_id()) and (select public.can_write()))', b || '_equipe_grava', b);
    execute format('create policy %I on storage.objects for update to authenticated using (bucket_id = %L and public.storage_path_org(name) = (select public.current_org_id()) and (select public.can_write()))', b || '_equipe_altera', b);
    execute format('create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and public.storage_path_org(name) = (select public.current_org_id()) and (select public.can_write()))', b || '_equipe_apaga', b);
  end loop;
end $$;

-- Locatário lê os próprios arquivos (pasta = id do cliente); gravação do app já validada por pasta.
drop policy if exists "locatario_le_proprios_arquivos" on storage.objects;
create policy "locatario_le_proprios_arquivos" on storage.objects for select to authenticated
  using (bucket_id in ('documentos', 'comprovantes', 'ocorrencias') and (storage.foldername(name))[1] = public.current_client_id());

commit;
