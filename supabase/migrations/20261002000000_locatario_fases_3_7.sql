-- LOCAKAR — App do Locatário, fases 3 a 7: vistoria pelo app, ocorrências, documentos, multas, reservas,
-- push nativo, realtime, antifraude, auditoria e retenção.
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
-- Requer 20260930000000_locatario_app_schema.sql e 20261001000000_locatario_fixes.sql.
--
-- Regra geral: o locatário só LÊ os próprios dados. Toda gravação passa pelo servidor (/api/tenant/*),
-- que confere dono, calcula valores, registra auditoria e avisa a equipe.

-- ============================================================================
-- 0. CORREÇÃO: regras de cobrança da locação (periodicidade, juros, envio automático).
--    O painel já grava este campo desde as cobranças PIX, mas a coluna não tinha sido criada.
-- ============================================================================
alter table public.rentals add column if not exists billing jsonb;

-- ============================================================================
-- 1. VISTORIA FEITA PELO LOCATÁRIO NO APP (histórico; a vistoria oficial da equipe continua em rentals)
-- ============================================================================
create table if not exists public.tenant_inspections (
  id            text primary key default gen_random_uuid()::text,
  rental_id     text not null references public.rentals(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  vehicle_id    text not null references public.vehicles(id) on delete cascade,
  kind          text not null check (kind in ('delivery', 'return', 'periodic')),
  km            int  not null check (km >= 0),
  fuel          text not null check (fuel in ('empty', 'quarter', 'half', 'three_quarters', 'full')),
  items         jsonb not null default '[]'::jsonb,  -- [{key, label, ok, note?}]
  photos        jsonb not null default '[]'::jsonb,  -- [{slot, path}] no bucket privado "vistorias"
  damages       text,
  notes         text,
  signature_svg text check (signature_svg is null or length(signature_svg) <= 60000),
  status        text not null default 'submitted' check (status in ('submitted', 'reviewed', 'rejected')),
  admin_notes   text,
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  request_id    text not null,                     -- idempotência: reenviar não duplica
  ip_address    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (client_id, request_id)
);
create index if not exists tenant_inspections_rental_idx on public.tenant_inspections (rental_id, created_at desc);

-- ============================================================================
-- 2. DOCUMENTOS ENVIADOS PELO LOCATÁRIO (CNH, comprovante de endereço) com análise da equipe
-- ============================================================================
create table if not exists public.tenant_documents (
  id               text primary key default gen_random_uuid()::text,
  client_id        text not null references public.clients(id) on delete cascade,
  kind             text not null check (kind in ('cnh_front', 'cnh_back', 'address_proof')),
  path             text not null,                  -- bucket privado "documentos", pasta <client_id>/
  status           text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by      uuid references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists tenant_documents_client_idx on public.tenant_documents (client_id, created_at desc);
-- Um documento de cada tipo em análise por vez.
create unique index if not exists tenant_documents_one_pending_idx
  on public.tenant_documents (client_id, kind) where status = 'pending_review';

-- ============================================================================
-- 3. AUDITORIA (quem fez o quê, de onde). Só a equipe lê; só o servidor grava.
-- ============================================================================
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('client', 'staff', 'system')),
  actor_id   text,
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_type, actor_id, created_at desc);

-- ============================================================================
-- 4. AJUSTES NAS TABELAS DA FASE 1
-- ============================================================================
alter table public.vehicle_incidents add column if not exists request_id text;
create unique index if not exists vehicle_incidents_request_idx on public.vehicle_incidents (client_id, request_id) where request_id is not null;

-- Impressão digital do comprovante: a mesma imagem usada em outro pagamento vira sinal antifraude.
alter table public.payment_receipts add column if not exists proof_sha256 text;
create index if not exists payment_receipts_sha_idx on public.payment_receipts (proof_sha256) where proof_sha256 is not null;

-- Aparelho pode existir sem token de push (push recusado, Expo Go ou navegador).
alter table public.tenant_devices alter column push_token drop not null;
alter table public.tenant_devices drop constraint if exists tenant_devices_platform_check;
alter table public.tenant_devices add constraint tenant_devices_platform_check check (platform in ('ios', 'android', 'web'));
create index if not exists tenant_devices_installation_idx on public.tenant_devices (installation_id);

alter table public.antifraud_telemetry
  add column if not exists platform text,
  add column if not exists os_version text,
  add column if not exists device_model text,
  add column if not exists consented boolean not null default false;

-- Comprovantes do cliente cuja imagem já foi usada em outro comprovante (sinal antifraude). Só o servidor chama.
create or replace function public.duplicate_proofs_count(p_client_id text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.payment_receipts a
   where a.client_id = p_client_id and a.proof_sha256 is not null
     and exists (select 1 from public.payment_receipts b where b.proof_sha256 = a.proof_sha256 and b.id <> a.id);
$$;
revoke all on function public.duplicate_proofs_count(text) from public, anon, authenticated;

-- Retenção (LGPD): telemetria de segurança por 180 dias; aparelhos inativos há 1 ano; auditoria por 5 anos.
-- Chamada pela rotina diária (/api/cron/alerts) com a chave de serviço.
create or replace function public.purge_tenant_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t int; d int; a int;
begin
  delete from public.antifraud_telemetry where created_at < now() - interval '180 days';
  get diagnostics t = row_count;
  delete from public.tenant_devices where active = false and updated_at < now() - interval '1 year';
  get diagnostics d = row_count;
  delete from public.audit_log where created_at < now() - interval '5 years';
  get diagnostics a = row_count;
  return jsonb_build_object('telemetry', t, 'devices', d, 'audit', a);
end $$;
revoke all on function public.purge_tenant_data() from public, anon, authenticated;

-- ============================================================================
-- 5. RLS: locatário só lê. Gravações diretas pelo app são removidas (passam pelo servidor).
-- ============================================================================
alter table public.tenant_inspections enable row level security;
alter table public.tenant_documents enable row level security;
alter table public.audit_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tenant_inspections', 'tenant_documents'] loop
    execute format('drop policy if exists "equipe_total" on public.%I', t);
    execute format('create policy "equipe_total" on public.%I for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists "locatario_le_proprias_vistorias" on public.tenant_inspections;
create policy "locatario_le_proprias_vistorias" on public.tenant_inspections
  for select to authenticated using (client_id = public.current_client_id());

drop policy if exists "locatario_le_proprios_documentos" on public.tenant_documents;
create policy "locatario_le_proprios_documentos" on public.tenant_documents
  for select to authenticated using (client_id = public.current_client_id());

drop policy if exists "equipe_le_auditoria" on public.audit_log;
create policy "equipe_le_auditoria" on public.audit_log for select to authenticated using ((select public.is_staff()));
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- Ocorrência: o insert direto não conferia se a locação/veículo eram do cliente. Agora só pelo servidor.
drop policy if exists "locatario_reporta_ocorrencia" on public.vehicle_incidents;
-- Reservas: pedido e cancelamento pelo servidor (confere conflito com locações e avisa a equipe).
drop policy if exists "locatario_cria_reserva" on public.reservations;
drop policy if exists "locatario_cancela_reserva" on public.reservations;
-- Dispositivos e telemetria: gravados só pelo servidor (IP real, score calculado lá).
drop policy if exists "locatario_gerencia_proprios_dispositivos" on public.tenant_devices;
drop policy if exists "locatario_grava_propria_telemetria" on public.antifraud_telemetry;

-- Locações, cadastro e reservas têm observações internas da equipe (coluna notes).
-- O locatário deixa de ler as tabelas e passa a ler views só com o que é dele e sem esses campos.
create or replace function public.owns_rental(p_rental_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rentals where id = p_rental_id and client_id = public.current_client_id());
$$;
revoke all on function public.owns_rental(text) from public, anon;
grant execute on function public.owns_rental(text) to authenticated;

drop policy if exists "locatario_le_proprias_locacoes" on public.rentals;
drop policy if exists "locatario_le_proprio_perfil" on public.clients;
drop policy if exists "locatario_le_proprias_reservas" on public.reservations;

create or replace view public.tenant_rentals as
  select r.id, r.client_id, r.vehicle_id, r.contract_type, r.start_date, r.start_time, r.end_date, r.end_time,
         r.deposit, r.km_start, r.km_end, r.weekly_rate, r.receipts, r.billing, r.status,
         r.delivery_inspection - 'clientSignature' as delivery_inspection,
         r.return_inspection - 'clientSignature' as return_inspection
    from public.rentals r
   where r.client_id = public.current_client_id();

create or replace view public.tenant_profile as
  select c.id, c.name, c.cpf, c.email, c.phone, c.cnh_expiry, c.cnh_number, c.cnh_category
    from public.clients c
   where c.user_id = (select auth.uid());

create or replace view public.tenant_reservations as
  select s.id, s.vehicle_id, s.start_date, s.end_date, s.status, s.created_at
    from public.reservations s
   where s.client_id = public.current_client_id();

-- Frota para pedir reserva: só o que a vitrine do site já mostra (sem placa, Renavam, compra, IPVA).
create or replace view public.tenant_fleet as
  select v.id, v.name, v.brand, v.model, v.year, v.image, v.category, v.transmission, v.fuel, v.seats,
         v.air_conditioning, v.daily_rate, v.weekly_rate
    from public.vehicles v
   where v.status <> 'sold' and public.current_client_id() is not null;

-- Multas: a tabela tem "infrator real" e observações internas. O locatário lê pela view abaixo.
drop policy if exists "locatario_le_proprias_multas" on public.fines;
create or replace view public.tenant_fines as
  select f.id, f.vehicle_id, f.notice_number, f.infraction_date, f.driver_id_deadline, f.discount_deadline,
         f.description, f.due_date, f.amount, f.payment_date, f.amount_paid, f.status
    from public.fines f
   where f.client_id = public.current_client_id();
revoke all on public.tenant_fines, public.tenant_rentals, public.tenant_profile, public.tenant_reservations, public.tenant_fleet from anon;
grant select on public.tenant_fines, public.tenant_rentals, public.tenant_profile, public.tenant_reservations, public.tenant_fleet to authenticated;

-- As views antigas liam rentals com as permissões do dono; continuam iguais. As policies de Storage que
-- consultavam rentals como o locatário passam a usar owns_rental() (a tabela não é mais legível por ele).
drop policy if exists "vistorias_locatario_le" on storage.objects;
create policy "vistorias_locatario_le" on storage.objects
  for select to authenticated
  using (bucket_id = 'vistorias' and public.owns_rental((storage.foldername(name))[1]));

-- ============================================================================
-- 6. STORAGE: fotos da vistoria do app em vistorias/<rental_id>/app/<envio>/<foto>.jpg
-- ============================================================================
drop policy if exists "vistorias_locatario_grava" on storage.objects;
create policy "vistorias_locatario_grava" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vistorias'
    and (storage.foldername(name))[2] = 'app'
    and public.owns_rental((storage.foldername(name))[1])
  );

-- Limites dos buckets privados: só imagens, até 8 MB.
update storage.buckets
   set file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('comprovantes', 'documentos', 'vistorias', 'ocorrencias');

-- ============================================================================
-- 7. REALTIME: o app atualiza sozinho quando a equipe aprova/responde (RLS continua valendo)
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['payment_receipts', 'vehicle_incidents', 'tenant_documents', 'tenant_inspections'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
