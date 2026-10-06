-- Bloqueio/desbloqueio: IMEI por veículo, intenção durável e reserva atômica. Nenhum comando é enviado por SQL.
begin;
alter table public.vehicles add column if not exists selsyn_imei text
  check (selsyn_imei is null or selsyn_imei ~ '^[0-9]{15}$');
create unique index if not exists vehicles_org_selsyn_imei_key on public.vehicles (organization_id, selsyn_imei)
  where selsyn_imei is not null;

create table if not exists public.selsyn_commands (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  vehicle_id text not null references public.vehicles(id),
  actor_id uuid not null,
  action text not null check (action in ('lock','unlock')),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (char_length(reason) between 5 and 300),
  identifier text not null,
  trackable_id text not null,
  imei text not null check (imei ~ '^[0-9]{15}$'),
  status text not null default 'reserved' check (status in ('reserved','sending','accepted','confirmed','rejected','unknown')),
  provider_command_id text,
  provider_status text,
  provider_returned_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  finished_at timestamptz
);
create index if not exists selsyn_commands_vehicle_idx on public.selsyn_commands (organization_id, vehicle_id, created_at desc);
alter table public.selsyn_commands enable row level security;
revoke all on public.selsyn_commands from public, anon, authenticated;
grant all on public.selsyn_commands to service_role;

create table if not exists public.selsyn_command_auth_attempts (
  actor_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists selsyn_command_auth_actor_idx on public.selsyn_command_auth_attempts (actor_id, created_at);
alter table public.selsyn_command_auth_attempts enable row level security;
revoke all on public.selsyn_command_auth_attempts from public, anon, authenticated;
grant all on public.selsyn_command_auth_attempts to service_role;

create or replace function public.reserve_selsyn_command_auth(p_actor uuid) returns boolean
language plpgsql security definer set search_path = '' as $auth$
begin
  perform pg_advisory_xact_lock(hashtextextended('selsyn-auth:' || p_actor::text, 0));
  delete from public.selsyn_command_auth_attempts where created_at < now() - interval '10 minutes';
  if (select count(*) from public.selsyn_command_auth_attempts where actor_id = p_actor) >= 5 then return false; end if;
  insert into public.selsyn_command_auth_attempts (actor_id) values (p_actor);
  return true;
end $auth$;
revoke all on function public.reserve_selsyn_command_auth(uuid) from public, anon, authenticated;
grant execute on function public.reserve_selsyn_command_auth(uuid) to service_role;

create or replace function public.guard_selsyn_vehicle_link() returns trigger
language plpgsql security definer set search_path = '' as $guard$
begin
  if current_setting('role', true) in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      if new.selsyn_rastreavel_id is not null or new.selsyn_identificador is not null or new.selsyn_linked_at is not null or new.selsyn_imei is not null then
        raise exception 'Vínculo Selsyn deve ser validado pelo backend.' using errcode = '42501';
      end if;
    elsif new.selsyn_rastreavel_id is distinct from old.selsyn_rastreavel_id or new.selsyn_identificador is distinct from old.selsyn_identificador
       or new.selsyn_linked_at is distinct from old.selsyn_linked_at or new.selsyn_imei is distinct from old.selsyn_imei then
      raise exception 'Vínculo Selsyn deve ser validado pelo backend.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.plate is distinct from old.plate or new.selsyn_rastreavel_id is distinct from old.selsyn_rastreavel_id
       or new.selsyn_identificador is distinct from old.selsyn_identificador or new.selsyn_imei is distinct from old.selsyn_imei then
      if exists (select 1 from public.selsyn_commands where vehicle_id = old.id and status in ('reserved','sending','accepted','unknown')) then
        raise exception 'Resolva o comando pendente antes de alterar o vínculo do veículo.' using errcode = '42501';
      end if;
      if new.plate is distinct from old.plate or new.selsyn_rastreavel_id is distinct from old.selsyn_rastreavel_id
         or new.selsyn_identificador is distinct from old.selsyn_identificador then new.selsyn_imei := null; end if;
    end if;
  end if;
  return new;
end $guard$;
revoke all on function public.guard_selsyn_vehicle_link() from public, anon, authenticated;
drop trigger if exists vehicles_selsyn_link_guard on public.vehicles;
create trigger vehicles_selsyn_link_guard before insert or update on public.vehicles
for each row execute function public.guard_selsyn_vehicle_link();

create or replace function public.reserve_selsyn_command(
  p_org uuid, p_id uuid, p_vehicle text, p_actor uuid, p_action text, p_hash text, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $reserve$
declare v public.vehicles; c public.selsyn_commands;
begin
  select * into v from public.vehicles where id = p_vehicle and organization_id = p_org for update;
  if not found then return jsonb_build_object('result','not_found'); end if;
  if not exists (select 1 from public.organizations where id = p_org and status in ('active','trial','past_due')) or not exists (select 1 from public.memberships where organization_id = p_org and user_id = p_actor and role in ('owner','admin')) then
    return jsonb_build_object('result','forbidden');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('selsyn-command-id:' || p_id::text, 0));
  select * into c from public.selsyn_commands where id = p_id;
  if found then
    if c.organization_id <> p_org or c.vehicle_id <> p_vehicle or c.actor_id <> p_actor or c.input_hash <> p_hash or c.action <> p_action then
      return jsonb_build_object('result','conflict');
    end if;
    return jsonb_build_object('result','duplicate','id',c.id,'status',c.status);
  end if;
  if v.selsyn_imei is null or v.selsyn_rastreavel_id is null then return jsonb_build_object('result','missing_imei'); end if;
  if exists (select 1 from public.selsyn_commands where organization_id = p_org and vehicle_id = p_vehicle and status in ('reserved','sending','accepted','unknown')) then
    return jsonb_build_object('result','pending');
  end if;
  if exists (select 1 from public.selsyn_commands where organization_id = p_org and vehicle_id = p_vehicle and created_at > now() - interval '30 seconds') then
    return jsonb_build_object('result','cooldown');
  end if;
  insert into public.selsyn_commands (id,organization_id,vehicle_id,actor_id,action,input_hash,reason,identifier,trackable_id,imei)
  values (p_id,p_org,p_vehicle,p_actor,p_action,p_hash,p_reason,v.plate,v.selsyn_rastreavel_id,v.selsyn_imei);
  return jsonb_build_object('result','reserved','id',p_id,'identifier',v.plate,'trackableId',v.selsyn_rastreavel_id,'imei',v.selsyn_imei);
end $reserve$;
revoke all on function public.reserve_selsyn_command(uuid,uuid,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.reserve_selsyn_command(uuid,uuid,text,uuid,text,text,text) to service_role;
commit;
