-- Sessão Selsyn por locadora; tokens cifrados e rotação serializada. Não envia comandos ao veículo.
begin;
create table if not exists public.selsyn_session (
  organization_id uuid primary key references public.organizations(id),
  login_enc text,
  access_token_enc text,
  refresh_token_enc text,
  access_expires_at timestamptz,
  login_expires_at timestamptz,
  namespace text,
  state text not null default 'disconnected' check (state in ('disconnected','connecting','connected','refreshing','reauth_required')),
  revision bigint not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.selsyn_session enable row level security;
revoke all on public.selsyn_session from public, anon, authenticated;
grant all on public.selsyn_session to service_role;

create or replace function public.acquire_selsyn_session(p_org uuid, p_lease uuid, p_connect boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $lease$
declare s public.selsyn_session;
begin
  insert into public.selsyn_session(organization_id) values(p_org) on conflict do nothing;
  select * into s from public.selsyn_session where organization_id = p_org for update;
  if s.lease_until > now() then return jsonb_build_object('result','busy'); end if;
  -- Lease expirada não autoriza reutilizar refresh token possivelmente já consumido.
  if s.state in ('connecting','refreshing') then
    update public.selsyn_session set state='reauth_required', last_error='ROTATION_UNCERTAIN',
      access_token_enc=null, refresh_token_enc=null, lease_id=null, lease_until=null, revision=revision+1, updated_at=now()
    where organization_id=p_org;
    if not p_connect then return jsonb_build_object('result','reauth_required'); end if;
    select * into s from public.selsyn_session where organization_id=p_org;
  end if;
  if not p_connect then
    if s.state <> 'connected' or s.refresh_token_enc is null or s.login_expires_at <= now() then return jsonb_build_object('result','reauth_required'); end if;
    if s.access_expires_at > now() + interval '60 seconds' then return jsonb_build_object('result','fresh'); end if;
  end if;
  update public.selsyn_session set state=case when p_connect then 'connecting' else 'refreshing' end,
    lease_id=p_lease, lease_until=now()+interval '45 seconds', updated_at=now()
  where organization_id=p_org;
  return jsonb_build_object('result','acquired','revision',s.revision);
end $lease$;
revoke all on function public.acquire_selsyn_session(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.acquire_selsyn_session(uuid,uuid,boolean) to service_role;

create or replace function public.finish_selsyn_session(
  p_org uuid, p_lease uuid, p_revision bigint, p_login text, p_access text, p_refresh text,
  p_access_expires timestamptz, p_login_expires timestamptz, p_namespace text, p_error text
) returns boolean language plpgsql security definer set search_path = '' as $finish$
begin
  update public.selsyn_session set login_enc=case when p_error is null then p_login else null end,
    access_token_enc=case when p_error is null then p_access else null end,
    refresh_token_enc=case when p_error is null then p_refresh else null end,
    access_expires_at=case when p_error is null then p_access_expires else null end,
    login_expires_at=case when p_error is null then p_login_expires else null end,
    namespace=case when p_error is null then p_namespace else namespace end,
    state=case when p_error is null then 'connected' else 'reauth_required' end,
    last_error=p_error, revision=revision+1, lease_id=null, lease_until=null, updated_at=now()
  where organization_id=p_org and lease_id=p_lease and revision=p_revision and lease_until > now();
  return found;
end $finish$;
revoke all on function public.finish_selsyn_session(uuid,uuid,bigint,text,text,text,timestamptz,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.finish_selsyn_session(uuid,uuid,bigint,text,text,text,timestamptz,timestamptz,text,text) to service_role;

create or replace function public.disconnect_selsyn_session(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $disconnect$
begin
  update public.selsyn_session set login_enc=null, access_token_enc=null, refresh_token_enc=null,
    access_expires_at=null, login_expires_at=null, namespace=null, state='disconnected',
    revision=revision+1, lease_id=null, lease_until=null, last_error=null, updated_at=now()
  where organization_id=p_org;
end $disconnect$;
revoke all on function public.disconnect_selsyn_session(uuid) from public,anon,authenticated;
grant execute on function public.disconnect_selsyn_session(uuid) to service_role;
commit;
