-- FIPE opcional: cadastro existente, preço numeric separado da compra, histórico e cache privados.
begin;
create table if not exists public.fipe_config (
 id int primary key default 1 check(id=1), enabled boolean not null default false,
 auto_update boolean not null default false, key_enc text, key_last4 text,
 verified_at timestamptz, generation uuid not null default gen_random_uuid(),
 last_error text, cooldown_until timestamptz, batch_locked_until timestamptz,
 last_auto_at timestamptz, updated_at timestamptz not null default now()
);
insert into public.fipe_config(id) values(1) on conflict do nothing;
alter table public.vehicles add column if not exists fipe jsonb,
 add column if not exists fipe_price numeric(12,2) check(fipe_price>0),
 add column if not exists fipe_reference_month text check(fipe_reference_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 add column if not exists fipe_checked_at timestamptz;
create table if not exists public.vehicle_fipe_history (
 id uuid primary key default gen_random_uuid(), vehicle_id text not null references public.vehicles(id) on delete cascade,
 fipe_code text not null check(fipe_code ~ '^\d{6}-\d$'), year_id text not null,
 price numeric(12,2) not null check(price>0), reference_month text not null check(reference_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 reference_code text, reference_label text not null, queried_at timestamptz not null default now(),
 provider text not null default 'parallelum' check(provider='parallelum'),
 unique(vehicle_id,fipe_code,year_id,reference_month)
);
create index if not exists vehicle_fipe_history_series_idx on public.vehicle_fipe_history(vehicle_id,reference_month);
create table if not exists public.fipe_cache (
 key text primary key, data jsonb, expires_at timestamptz, locked_until timestamptz,
 requested_at timestamptz not null default now()
);
-- Configuração/cache: ninguém lê pelo client Supabase, mesmo staff.
do $$ declare t text; begin
 foreach t in array array['fipe_config','fipe_cache'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
alter table public.vehicle_fipe_history enable row level security;
revoke all on public.vehicle_fipe_history from anon,authenticated;
grant select on public.vehicle_fipe_history to authenticated;
grant all on public.vehicle_fipe_history to service_role;
drop policy if exists equipe_le on public.vehicle_fipe_history;
create policy equipe_le on public.vehicle_fipe_history for select to authenticated using((select public.is_staff()));

-- Impede preço/vínculo forjados em writes client. Identidade alterada invalida vínculo (não apaga histórico).
create or replace function public.protect_vehicle_fipe() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' then
  if TG_OP='INSERT' then new.fipe=null;new.fipe_price=null;new.fipe_reference_month=null;new.fipe_checked_at=null;
  else new.fipe=old.fipe;new.fipe_price=old.fipe_price;new.fipe_reference_month=old.fipe_reference_month;new.fipe_checked_at=old.fipe_checked_at;
  end if;
 end if;
 if TG_OP='UPDATE' and old.fipe is not null and
  (new.brand,new.model,new.year,new.year_model,new.vehicle_type,new.fuel) is distinct from
  (old.brand,old.model,old.year,old.year_model,old.vehicle_type,old.fuel) then
  new.fipe=null;new.fipe_price=null;new.fipe_reference_month=null;new.fipe_checked_at=null;
 end if;
 return new;
end $$;
drop trigger if exists protect_vehicle_fipe on public.vehicles;
create trigger protect_vehicle_fipe before insert or update on public.vehicles for each row execute function public.protect_vehicle_fipe();

-- Lease de consulta + limite interno global 45/min. Não é a quota oficial do plano.
create or replace function public.reserve_fipe_query(p_key text) returns text language plpgsql security definer set search_path='' as $$
declare r public.fipe_cache%rowtype;begin
 perform pg_advisory_xact_lock(981022);
 delete from public.fipe_cache where expires_at < now()-interval '7 days' and coalesce(locked_until,now())<=now();
 select * into r from public.fipe_cache where key=p_key;
 if r.data is not null and r.expires_at>now() then return 'cached';end if;
 if r.locked_until>now() then return 'busy';end if;
 if (select cooldown_until>now() from public.fipe_config where id=1) then return 'limited';end if;
 if (select count(*) from public.fipe_cache where requested_at>now()-interval '1 minute')>=45 then return 'limited';end if;
 insert into public.fipe_cache(key,requested_at,locked_until) values(p_key,now(),now()+interval '20 seconds')
 on conflict(key) do update set requested_at=now(),locked_until=now()+interval '20 seconds';
 return 'reserved';end $$;

-- Snapshot e histórico em uma transação; bloqueia alteração concorrente da identidade.
create or replace function public.save_vehicle_fipe(p_vehicle text,p_identity jsonb,p_link jsonb,p_price numeric,p_month text,p_label text,p_reference text,p_history jsonb default '[]'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v public.vehicles%rowtype; h jsonb;begin
 select * into v from public.vehicles where id=p_vehicle for update;
 if not found then raise exception 'Veículo não encontrado';end if;
 if jsonb_build_object('brand',v.brand,'model',v.model,'year',v.year,'yearModel',v.year_model,'type',v.vehicle_type,'fuel',v.fuel)<>p_identity then raise exception 'Identidade do veículo alterada';end if;
 update public.vehicles set fipe=p_link,fipe_price=p_price,fipe_reference_month=p_month,fipe_checked_at=now() where id=p_vehicle;
 insert into public.vehicle_fipe_history(vehicle_id,fipe_code,year_id,price,reference_month,reference_label,reference_code)
 values(p_vehicle,p_link->>'code',p_link->>'yearId',p_price,p_month,p_label,p_reference)
 on conflict(vehicle_id,fipe_code,year_id,reference_month) do update set price=excluded.price,queried_at=now();
 for h in select * from jsonb_array_elements(p_history) loop
 insert into public.vehicle_fipe_history(vehicle_id,fipe_code,year_id,price,reference_month,reference_label,reference_code)
 values(p_vehicle,p_link->>'code',p_link->>'yearId',(h->>'price')::numeric,h->>'month',h->>'label',h->>'reference')
 on conflict(vehicle_id,fipe_code,year_id,reference_month) do nothing;
 end loop;
end $$;
revoke all on function public.reserve_fipe_query(text) from public,anon,authenticated;
grant execute on function public.reserve_fipe_query(text) to service_role;
revoke all on function public.save_vehicle_fipe(text,jsonb,jsonb,numeric,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_vehicle_fipe(text,jsonb,jsonb,numeric,text,text,text,jsonb) to service_role;
commit;
