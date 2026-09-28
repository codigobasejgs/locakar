-- LOCAKAR — Suporte ao App Oficial do Locatário
-- Auth do cliente, RLS granular (anti-IDOR), comprovantes PIX, ocorrências, dispositivos push, telemetria e Storage.
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
-- Requer migrations anteriores (01 a 05).

-- ============================================================================
-- 1. VÍNCULO DE AUTH COM CLIENTES
-- ============================================================================

alter table public.clients
  add column if not exists user_id uuid unique references auth.users(id) on delete set null,
  add column if not exists cnh_number text,
  add column if not exists cnh_category text check (cnh_category in ('A','B','AB','C','D','E')),
  add column if not exists cnh_front_url text,
  add column if not exists cnh_back_url text,
  add column if not exists address_proof_url text,
  add column if not exists avatar_url text;

create index if not exists clients_user_id_idx on public.clients (user_id);

-- Helper seguro: descobre o client_id do usuário logado no token JWT
create or replace function public.current_client_id() returns text
language sql stable security definer set search_path = '' as $$
  select id from public.clients where user_id = (select auth.uid()) limit 1;
$$;
grant execute on function public.current_client_id() to authenticated;

-- Trigger: ao cadastrar auth.users pelo app com CPF no raw_user_meta_data, vincula ao cliente existente
create or replace function public.handle_client_user_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cpf text;
begin
  v_cpf := regexp_replace(coalesce(new.raw_user_meta_data->>'cpf', ''), '\D', '', 'g');
  if v_cpf <> '' then
    update public.clients
    set user_id = new.id, updated_at = now()
    where regexp_replace(cpf, '\D', '', 'g') = v_cpf
      and (user_id is null or user_id = new.id);
  elsif new.email is not null and new.email <> '' then
    update public.clients
    set user_id = new.id, updated_at = now()
    where lower(email) = lower(new.email)
      and (user_id is null or user_id = new.id);
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_link_client on auth.users;
create trigger on_auth_user_created_link_client
  after insert on auth.users
  for each row execute function public.handle_client_user_link();

-- ============================================================================
-- 2. NOVAS TABELAS PARA O LOCATÁRIO
-- ============================================================================

-- Comprovantes de pagamento enviados pelo locatário para aprovação do Admin
create table if not exists public.payment_receipts (
  id               text primary key default gen_random_uuid()::text,
  rental_id        text not null references public.rentals(id) on delete cascade,
  receipt_id       text not null, -- id da parcela em rentals.receipts (ex.: rental-r1)
  client_id        text not null references public.clients(id) on delete cascade,
  amount           numeric(12,2) not null check (amount > 0),
  payment_date     date not null default current_date,
  proof_url        text not null,
  status           text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  reviewed_by      uuid references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  rejection_reason text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists payment_receipts_client_idx on public.payment_receipts (client_id);
create index if not exists payment_receipts_rental_idx on public.payment_receipts (rental_id);
create index if not exists payment_receipts_status_idx on public.payment_receipts (status);

-- Ocorrências reportadas pelo locatário (mecânica, pneu, sinistro, etc.)
create table if not exists public.vehicle_incidents (
  id             text primary key default gen_random_uuid()::text,
  rental_id      text not null references public.rentals(id) on delete cascade,
  client_id      text not null references public.clients(id) on delete cascade,
  vehicle_id     text not null references public.vehicles(id) on delete cascade,
  category       text not null check (category in ('mecanica', 'pneu', 'eletrica', 'ar_condicionado', 'acidente', 'painel', 'vidro', 'lataria', 'outro')),
  description    text not null check (length(trim(description)) >= 10),
  media_urls     text[] not null default '{}',
  location_lat   numeric(10,7),
  location_lng   numeric(10,7),
  status         text not null default 'open' check (status in ('open', 'in_review', 'in_service', 'waiting_client', 'resolved', 'cancelled')),
  admin_notes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists vehicle_incidents_client_idx on public.vehicle_incidents (client_id);
create index if not exists vehicle_incidents_rental_idx on public.vehicle_incidents (rental_id);
create index if not exists vehicle_incidents_status_idx on public.vehicle_incidents (status);

-- Dispositivos móveis registrados no App do Locatário (Push nativo via Expo / FCM)
create table if not exists public.tenant_devices (
  id              text primary key default gen_random_uuid()::text,
  client_id       text not null references public.clients(id) on delete cascade,
  installation_id text not null,
  push_token      text not null,
  platform        text not null check (platform in ('ios', 'android')),
  device_model    text,
  os_version      text,
  app_version     text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (client_id, installation_id)
);
create index if not exists tenant_devices_client_idx on public.tenant_devices (client_id);

-- Telemetria de segurança autorizada (LGPD) e score antifraude
create table if not exists public.antifraud_telemetry (
  id               text primary key default gen_random_uuid()::text,
  client_id        text not null references public.clients(id) on delete cascade,
  device_id        text not null,
  ip_address       text,
  app_version      text,
  integrity_status text, -- ex.: 'play_protect_verified', 'app_attest_valid', 'failed'
  is_emulator      boolean not null default false,
  battery_level    numeric(4,2),
  network_type     text,
  location_lat     numeric(10,7),
  location_lng     numeric(10,7),
  risk_score       int check (risk_score between 0 and 100),
  risk_factors     text[] default '{}',
  created_at       timestamptz not null default now()
);
create index if not exists antifraud_telemetry_client_idx on public.antifraud_telemetry (client_id, created_at desc);

-- Consentimentos expressos do locatário (LGPD)
create table if not exists public.tenant_consents (
  id             text primary key default gen_random_uuid()::text,
  client_id      text not null references public.clients(id) on delete cascade,
  policy_version text not null,
  scopes         text[] not null default '{}',
  consented_at   timestamptz not null default now(),
  ip_address     text
);
create index if not exists tenant_consents_client_idx on public.tenant_consents (client_id);

-- View segura de manutenção: locatário vê apenas o que precisa, SEM custo (amount) nem fornecedor (supplier)
create or replace view public.client_vehicle_maintenance as
  select
    m.id,
    m.vehicle_id,
    m.date,
    m.description,
    m.current_km,
    m.next_km,
    m.status,
    m.created_at
  from public.maintenance m
  where m.vehicle_id in (
    select r.vehicle_id from public.rentals r
    where r.client_id = public.current_client_id()
      and r.status in ('active', 'late', 'pending')
  );

-- ============================================================================
-- 3. STORAGE BUCKETS
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('veiculos', 'veiculos', true),
  ('documentos', 'documentos', false),
  ('vistorias', 'vistorias', false),
  ('comprovantes', 'comprovantes', false),
  ('ocorrencias', 'ocorrencias', false)
on conflict (id) do update set public = excluded.public;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) PARA O LOCATÁRIO (ANTI-IDOR)
-- ============================================================================

-- Ativa RLS nas novas tabelas
alter table public.payment_receipts enable row level security;
alter table public.vehicle_incidents enable row level security;
alter table public.tenant_devices enable row level security;
alter table public.antifraud_telemetry enable row level security;
alter table public.tenant_consents enable row level security;

-- Equipe (is_staff) tem acesso completo
do $$
declare t text;
begin
  foreach t in array array['payment_receipts','vehicle_incidents','tenant_devices','antifraud_telemetry','tenant_consents'] loop
    execute format('drop policy if exists "equipe_total" on public.%I', t);
    execute format('create policy "equipe_total" on public.%I for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant all on public.%I to authenticated', t);
  end loop;
end $$;

-- --- CLIENTS ---
drop policy if exists "locatario_le_proprio_perfil" on public.clients;
create policy "locatario_le_proprio_perfil" on public.clients
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "locatario_atualiza_proprio_perfil" on public.clients;
create policy "locatario_atualiza_proprio_perfil" on public.clients
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- --- VEHICLES ---
-- Locatário pode ver carros disponíveis ou o carro vinculado à sua locação
drop policy if exists "locatario_le_veiculos" on public.vehicles;
create policy "locatario_le_veiculos" on public.vehicles
  for select to authenticated
  using (
    status = 'available'
    or id in (select vehicle_id from public.rentals where client_id = public.current_client_id())
  );

-- --- RENTALS ---
drop policy if exists "locatario_le_proprias_locacoes" on public.rentals;
create policy "locatario_le_proprias_locacoes" on public.rentals
  for select to authenticated
  using (client_id = public.current_client_id());

-- --- CONTRACTS ---
drop policy if exists "locatario_le_proprios_contratos" on public.contracts;
create policy "locatario_le_proprios_contratos" on public.contracts
  for select to authenticated
  using (rental_id in (select id from public.rentals where client_id = public.current_client_id()));

-- --- FINES ---
drop policy if exists "locatario_le_proprias_multas" on public.fines;
create policy "locatario_le_proprias_multas" on public.fines
  for select to authenticated
  using (client_id = public.current_client_id());

-- --- RESERVATIONS ---
drop policy if exists "locatario_le_proprias_reservas" on public.reservations;
create policy "locatario_le_proprias_reservas" on public.reservations
  for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists "locatario_cria_reserva" on public.reservations;
create policy "locatario_cria_reserva" on public.reservations
  for insert to authenticated
  with check (client_id = public.current_client_id() and status = 'pending');

drop policy if exists "locatario_cancela_reserva" on public.reservations;
create policy "locatario_cancela_reserva" on public.reservations
  for update to authenticated
  using (client_id = public.current_client_id() and status in ('pending', 'confirmed'))
  with check (client_id = public.current_client_id() and status = 'cancelled');

-- --- PAYMENT_RECEIPTS ---
drop policy if exists "locatario_le_proprios_comprovantes" on public.payment_receipts;
create policy "locatario_le_proprios_comprovantes" on public.payment_receipts
  for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists "locatario_envia_comprovante" on public.payment_receipts;
create policy "locatario_envia_comprovante" on public.payment_receipts
  for insert to authenticated
  with check (client_id = public.current_client_id() and status = 'pending_review');

-- --- VEHICLE_INCIDENTS ---
drop policy if exists "locatario_le_proprias_ocorrencias" on public.vehicle_incidents;
create policy "locatario_le_proprias_ocorrencias" on public.vehicle_incidents
  for select to authenticated
  using (client_id = public.current_client_id());

drop policy if exists "locatario_reporta_ocorrencia" on public.vehicle_incidents;
create policy "locatario_reporta_ocorrencia" on public.vehicle_incidents
  for insert to authenticated
  with check (client_id = public.current_client_id() and status = 'open');

-- --- TENANT_DEVICES ---
drop policy if exists "locatario_gerencia_proprios_dispositivos" on public.tenant_devices;
create policy "locatario_gerencia_proprios_dispositivos" on public.tenant_devices
  for all to authenticated
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- --- ANTIFRAUD_TELEMETRY ---
drop policy if exists "locatario_grava_propria_telemetria" on public.antifraud_telemetry;
create policy "locatario_grava_propria_telemetria" on public.antifraud_telemetry
  for insert to authenticated
  with check (client_id = public.current_client_id());

-- --- TENANT_CONSENTS ---
drop policy if exists "locatario_gerencia_proprio_consentimento" on public.tenant_consents;
create policy "locatario_gerencia_proprio_consentimento" on public.tenant_consents
  for all to authenticated
  using (client_id = public.current_client_id())
  with check (client_id = public.current_client_id());

-- ============================================================================
-- 5. STORAGE RLS POLICIES
-- ============================================================================

-- Veículos (público leitura)
drop policy if exists "veiculos_publico_le" on storage.objects;
create policy "veiculos_publico_le" on storage.objects
  for select to public
  using (bucket_id = 'veiculos');

drop policy if exists "veiculos_equipe_gerencia" on storage.objects;
create policy "veiculos_equipe_gerencia" on storage.objects
  for all to authenticated
  using (bucket_id = 'veiculos' and (select public.is_staff()))
  with check (bucket_id = 'veiculos' and (select public.is_staff()));

-- Documentos (CNH, residência): locatário grava/lê pasta client_id/*, equipe lê tudo
drop policy if exists "documentos_locatario_grava" on storage.objects;
create policy "documentos_locatario_grava" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.current_client_id()
  );

drop policy if exists "documentos_le" on storage.objects;
create policy "documentos_le" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos'
    and (
      (select public.is_staff())
      or (storage.foldername(name))[1] = public.current_client_id()
    )
  );

-- Comprovantes PIX: locatário grava/lê pasta client_id/*, equipe lê tudo
drop policy if exists "comprovantes_locatario_grava" on storage.objects;
create policy "comprovantes_locatario_grava" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprovantes'
    and (storage.foldername(name))[1] = public.current_client_id()
  );

drop policy if exists "comprovantes_le" on storage.objects;
create policy "comprovantes_le" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprovantes'
    and (
      (select public.is_staff())
      or (storage.foldername(name))[1] = public.current_client_id()
    )
  );

-- Ocorrências: locatário grava/lê pasta client_id/*, equipe lê tudo
drop policy if exists "ocorrencias_locatario_grava" on storage.objects;
create policy "ocorrencias_locatario_grava" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ocorrencias'
    and (storage.foldername(name))[1] = public.current_client_id()
  );

drop policy if exists "ocorrencias_le" on storage.objects;
create policy "ocorrencias_le" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ocorrencias'
    and (
      (select public.is_staff())
      or (storage.foldername(name))[1] = public.current_client_id()
    )
  );

-- Vistorias: equipe gerencia tudo, locatário lê da sua locação
drop policy if exists "vistorias_equipe_gerencia" on storage.objects;
create policy "vistorias_equipe_gerencia" on storage.objects
  for all to authenticated
  using (bucket_id = 'vistorias' and (select public.is_staff()))
  with check (bucket_id = 'vistorias' and (select public.is_staff()));

drop policy if exists "vistorias_locatario_le" on storage.objects;
create policy "vistorias_locatario_le" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vistorias'
    and (storage.foldername(name))[1] in (
      select id from public.rentals where client_id = public.current_client_id()
    )
  );
