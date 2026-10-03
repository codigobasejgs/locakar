-- LOCAKAR — Auto-onboarding, vitrine e solicitações de locação com aprovação em 1 clique.
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
-- Requer migrations anteriores (01 a 07).

-- ============================================================================
-- 1. AUTO-VÍNCULO E AUTO-CRIAÇÃO DE CLIENTE (elimina o erro 403 para sempre)
-- ============================================================================
-- Quando qualquer pessoa cria uma conta no app (Nome, CPF, Telefone, E-mail, Senha),
-- esta função garante que ela já tenha um registro na tabela `clients` vinculado ao seu `user_id`.
-- Se já existia um cliente com aquele CPF ou e-mail, vincula. Se for novo, cadastra na hora.
create or replace function public.ensure_client_for_current_user() returns text
language plpgsql security definer set search_path = '' as $$
declare
  u auth.users;
  v_id text;
  v_cpf text;
  v_name text;
  v_phone text;
begin
  select * into u from auth.users where id = (select auth.uid());
  if u.id is null then return null; end if;

  -- 1) Já vinculado pelo user_id
  select id into v_id from public.clients where user_id = u.id limit 1;
  if v_id is not null then return v_id; end if;

  v_cpf := regexp_replace(coalesce(u.raw_user_meta_data->>'cpf', ''), '\D', '', 'g');
  v_name := coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1));
  v_phone := coalesce(nullif(trim(u.raw_user_meta_data->>'phone'), ''), '');

  -- 2) Já existe por CPF ou e-mail na base da LOCAKAR? Vincula o user_id
  update public.clients
     set user_id = u.id, updated_at = now()
   where user_id is null
     and (
       (v_cpf <> '' and regexp_replace(cpf, '\D', '', 'g') = v_cpf)
       or (u.email is not null and lower(email) = lower(u.email))
     )
  returning id into v_id;

  if v_id is not null then return v_id; end if;

  -- 3) Cliente novo: auto-cadastra com código incremental seguro
  insert into public.clients (code, name, email, phone, cpf, user_id, registered_at)
  values (
    coalesce((select max(code) from public.clients), 0) + 1,
    v_name,
    u.email,
    v_phone,
    coalesce(nullif(v_cpf, ''), '00000000000'),
    u.id,
    current_date
  )
  returning id into v_id;

  return v_id;
end $$;
revoke all on function public.ensure_client_for_current_user() from public, anon;
grant execute on function public.ensure_client_for_current_user() to authenticated;

-- ============================================================================
-- 2. TABELA DE SOLICITAÇÕES DE LOCAÇÃO (RENTAL REQUESTS)
-- ============================================================================
create table if not exists public.rental_requests (
  id                 text primary key default gen_random_uuid()::text,
  client_id          text not null references public.clients(id) on delete cascade,
  vehicle_id         text not null references public.vehicles(id) on delete restrict,
  start_date         date not null,
  end_date           date not null,
  plan_type          text not null default 'weekly' check (plan_type in ('daily','weekly','biweekly','monthly')),
  rate_amount        numeric(12,2) not null check (rate_amount >= 0),
  deposit_amount     numeric(12,2) check (deposit_amount >= 0),
  cnh_number         text,
  cnh_category       text check (cnh_category in ('A','B','AB','C','D','E')),
  cnh_expiry         date,
  cnh_front_path     text not null,
  cnh_back_path      text not null,
  address_proof_path text not null,
  selfie_path        text,
  status             text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected', 'correction_requested')),
  rejection_reason   text,
  correction_notes   text,
  reviewed_by        uuid references auth.users(id) on delete set null,
  reviewed_at        timestamptz,
  created_rental_id  text references public.rentals(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists rental_requests_client_idx on public.rental_requests (client_id, created_at desc);
create index if not exists rental_requests_status_idx on public.rental_requests (status);
create index if not exists rental_requests_vehicle_idx on public.rental_requests (vehicle_id);

-- ============================================================================
-- 3. RLS E PERMISSÕES
-- ============================================================================
alter table public.rental_requests enable row level security;

-- Equipe (is_staff) tem controle total
drop policy if exists "equipe_total_rental_requests" on public.rental_requests;
create policy "equipe_total_rental_requests" on public.rental_requests
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Locatário lê somente as suas solicitações
drop policy if exists "locatario_le_proprias_solicitacoes" on public.rental_requests;
create policy "locatario_le_proprias_solicitacoes" on public.rental_requests
  for select to authenticated
  using (client_id = public.current_client_id());

revoke all on public.rental_requests from anon;
grant select, insert, update, delete on public.rental_requests to authenticated;

-- ============================================================================
-- 4. REALTIME: o app do locatário atualiza no segundo em que a equipe aprova
-- ============================================================================
do $$
begin
  alter publication supabase_realtime add table public.rental_requests;
exception when duplicate_object then null;
end $$;
