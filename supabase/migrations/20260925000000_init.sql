-- LOCAKAR — schema inicial
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run.
-- Idempotente: pode ser executado de novo sem apagar dados.

-- ---------- Função utilitária: updated_at automático ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Veículos (aba VEÍCULOS) ----------
create table if not exists public.vehicles (
  id               text primary key default gen_random_uuid()::text,
  name             text not null,
  brand            text not null,
  model            text not null,
  year             int  not null check (year between 1950 and 2100),
  image            text not null,
  category         text not null,
  transmission     text not null,
  fuel             text not null,
  seats            int  not null check (seats between 1 and 60),
  air_conditioning boolean not null default true,
  daily_rate       numeric(12,2) check (daily_rate >= 0),
  weekly_rate      numeric(12,2) check (weekly_rate >= 0),
  status           text not null default 'available'
                   check (status in ('available','rented','reserved','maintenance','sold')),
  plate            text not null unique check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  vehicle_type     text not null default 'Carro',
  purchase_date    date,
  purchase_value   numeric(12,2) check (purchase_value >= 0),
  year_model       text,
  renavam          text,
  ipva_value       numeric(12,2) check (ipva_value >= 0),
  ipva_status      text not null default 'open' check (ipva_status in ('paid','open','late')),
  licensing_month  text,
  licensing_status text not null default 'open' check (licensing_status in ('paid','open','late')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------- Clientes (aba CLIENTES) ----------
create table if not exists public.clients (
  id                 text primary key default gen_random_uuid()::text,
  code               int  not null unique,
  registered_at      date not null default current_date,
  name               text not null,
  phone              text not null,
  cpf                text not null unique,
  address            text,
  first_license_date date,
  cnh_expiry         date,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------- Locações (aba LOCAÇÃO) ----------
-- receipts: recebimentos semanais [{id, dueDate, amount, paid}] (colunas RECEBIMENTOS da planilha)
create table if not exists public.rentals (
  id              text primary key default gen_random_uuid()::text,
  client_id       text not null references public.clients(id) on delete restrict,
  vehicle_id      text not null references public.vehicles(id) on delete restrict,
  contract_type   text not null,
  start_date      date not null,
  start_time      text,
  end_date        date not null,
  end_time        text,
  payment_weekday text,
  deposit         numeric(12,2) check (deposit >= 0),
  km_start        int check (km_start >= 0),
  km_end          int check (km_end >= 0),
  weekly_rate     numeric(12,2) not null check (weekly_rate >= 0),
  receipts        jsonb not null default '[]'::jsonb,
  status          text not null default 'pending'
                  check (status in ('active','finished','late','cancelled','pending')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date),
  check (km_end is null or km_start is null or km_end >= km_start)
);

-- ---------- Reservas (aba RESERVA DE CARROS) ----------
create table if not exists public.reservations (
  id         text primary key default gen_random_uuid()::text,
  client_id  text not null references public.clients(id) on delete restrict,
  vehicle_id text not null references public.vehicles(id) on delete restrict,
  start_date date not null,
  end_date   date not null,
  status     text not null default 'pending' check (status in ('pending','confirmed','completed','cancelled')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- Impede, no banco, duas reservas ativas sobrepostas no mesmo veículo.
create extension if not exists btree_gist with schema extensions;
do $$ begin
  alter table public.reservations add constraint reservations_no_overlap
    exclude using gist (vehicle_id with =, daterange(start_date, end_date, '[]') with &&)
    where (status in ('pending','confirmed'));
exception when duplicate_object then null; end $$;

-- ---------- Despesas (aba DESPESAS) ----------
create table if not exists public.expenses (
  id             text primary key default gen_random_uuid()::text,
  date           date not null,
  description    text not null,
  vehicle_id     text references public.vehicles(id) on delete set null,
  supplier       text,
  amount         numeric(12,2) not null check (amount >= 0),
  paid           boolean not null default false,
  payment_method text,
  category       text not null check (category in ('recurring','misc')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- Manutenção (aba MANUTENÇÃO FROTA) ----------
create table if not exists public.maintenance (
  id          text primary key default gen_random_uuid()::text,
  date        date not null,
  vehicle_id  text not null references public.vehicles(id) on delete cascade,
  description text not null,
  current_km  int check (current_km >= 0),
  next_km     int check (next_km >= 0),
  supplier    text,
  amount      numeric(12,2) check (amount >= 0),
  status      text not null default 'scheduled' check (status in ('scheduled','pending','done')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Multas (aba MULTAS) ----------
create table if not exists public.fines (
  id                 text primary key default gen_random_uuid()::text,
  client_id          text references public.clients(id) on delete set null,
  real_offender      text,
  vehicle_id         text not null references public.vehicles(id) on delete restrict,
  notice_number      text not null unique,
  infraction_date    date not null,
  driver_id_deadline date,
  discount_deadline  date,
  description        text not null,
  due_date           date not null,
  amount             numeric(12,2) not null check (amount >= 0),
  payment_date       date,
  amount_paid        numeric(12,2) check (amount_paid >= 0),
  status             text not null default 'pending'
                     check (status in ('pending','identify','paid','overdue','contested')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------- Anotações (aba ANOTAÇÕES) ----------
create table if not exists public.notes (
  id          text primary key default gen_random_uuid()::text,
  date        date not null,
  time        text not null,
  client_id   text references public.clients(id) on delete set null,
  description text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Preferências do painel (uma linha) ----------
create table if not exists public.settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------- Índices das chaves estrangeiras e filtros mais usados ----------
create index if not exists rentals_client_idx       on public.rentals (client_id);
create index if not exists rentals_vehicle_idx      on public.rentals (vehicle_id);
create index if not exists rentals_period_idx       on public.rentals (start_date, end_date);
create index if not exists reservations_client_idx  on public.reservations (client_id);
create index if not exists reservations_vehicle_idx on public.reservations (vehicle_id);
create index if not exists expenses_vehicle_idx     on public.expenses (vehicle_id);
create index if not exists expenses_date_idx        on public.expenses (date);
create index if not exists maintenance_vehicle_idx  on public.maintenance (vehicle_id);
create index if not exists fines_client_idx         on public.fines (client_id);
create index if not exists fines_vehicle_idx        on public.fines (vehicle_id);
create index if not exists fines_due_idx            on public.fines (due_date);
create index if not exists notes_client_idx         on public.notes (client_id);

-- ---------- Equipe autorizada ----------
-- Só quem está nesta tabela acessa o painel. Estar autenticado NÃO basta:
-- mesmo que alguém crie conta pelo endpoint público de cadastro, não vê nenhum dado.
-- Sem políticas para usuários: só o SQL Editor / service role inclui ou remove membros.
create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
revoke all on public.staff from anon, authenticated;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff where user_id = (select auth.uid()));
$$;
revoke all on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- ---------- Triggers updated_at + RLS ----------
-- Visitantes anônimos do site não acessam nenhuma tabela.
do $$
declare t text;
begin
  foreach t in array array['vehicles','clients','rentals','reservations','expenses','maintenance','fines','notes','settings'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipe_total" on public.%I', t);
    execute format('create policy "equipe_total" on public.%I for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Liberar um usuário da equipe ----------
-- 1) Supabase → Authentication → Users → Add user (e-mail + senha, "Auto Confirm User").
-- 2) Rodar, trocando o e-mail:
--   insert into public.staff (user_id)
--   select id from auth.users where email = 'locakarveiculos@gmail.com'
--   on conflict do nothing;
