-- Selsyn: vínculo local e proteção de consultas; sem telemetria ou credenciais no banco.
begin;
alter table public.vehicles
  add column if not exists selsyn_rastreavel_id text check (selsyn_rastreavel_id ~ '^[1-9][0-9]{0,18}$'),
  add column if not exists selsyn_identificador text,
  add column if not exists selsyn_linked_at timestamptz;
create unique index if not exists vehicles_selsyn_id_unique on public.vehicles(selsyn_rastreavel_id) where selsyn_rastreavel_id is not null;

create table if not exists public.selsyn_requests (
  id uuid primary key,
  operator_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  input_hash text not null,
  status text not null default 'running' check(status in ('running','success','error')),
  error_code text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists selsyn_requests_time_idx on public.selsyn_requests(created_at);
alter table public.selsyn_requests enable row level security;
revoke all on public.selsyn_requests from public, anon, authenticated;
grant all on public.selsyn_requests to service_role;

-- Reserva atômica global (multi-instância Vercel). Limites internos, não quotas oficiais do fornecedor.
create or replace function public.reserve_selsyn_request(p_id uuid, p_operator uuid, p_operation text, p_hash text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(783409615);
  delete from public.selsyn_requests where created_at < now() - interval '1 day';
  if exists(select 1 from public.selsyn_requests where id = p_id) then return 'duplicate'; end if;
  if exists(select 1 from public.selsyn_requests where operator_id=p_operator and status='running' and created_at > now()-interval '35 seconds') then return 'busy'; end if;
  if exists(select 1 from public.selsyn_requests where operator_id=p_operator and input_hash=p_hash and operation_id=p_operation and created_at > now()-interval '5 seconds') then return 'duplicate'; end if;
  if (select count(*) from public.selsyn_requests where operator_id=p_operator and created_at > now()-interval '1 minute') >= 15
    or (select count(*) from public.selsyn_requests where created_at > now()-interval '1 minute') >= 60 then return 'limited'; end if;
  insert into public.selsyn_requests(id,operator_id,operation_id,input_hash) values(p_id,p_operator,p_operation,p_hash);
  return 'reserved';
end $$;
revoke all on function public.reserve_selsyn_request(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_selsyn_request(uuid,uuid,text,text) to service_role;
commit;
