-- LOCAKAR — Web Push (VAPID) e central de notificações do painel.
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
-- Requer 20260925000000_init.sql (staff / is_staff).

-- ---------- Dispositivos inscritos (um usuário pode ter vários) ----------
-- endpoint é único: registrar de novo o mesmo navegador atualiza a linha (upsert), não duplica.
create table if not exists public.push_subscriptions (
  id           text primary key default gen_random_uuid()::text,
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh       text not null check (length(p256dh) between 40 and 200),
  auth         text not null check (length(auth) between 10 and 100),
  user_agent   text,
  failures     int  not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------- Central de notificações (histórico, independe do navegador) ----------
-- dedupe_key: o mesmo evento (ex.: "receipt-due:<locação>:<dia>") só gera uma notificação.
create table if not exists public.notifications (
  id          text primary key default gen_random_uuid()::text,
  type        text not null,
  category    text not null,
  severity    text not null default 'info' check (severity in ('info','success','warning','critical')),
  title       text not null check (length(title) <= 120),
  body        text not null check (length(body) <= 400),
  url         text not null default '/admin' check (url like '/admin%'),
  dedupe_key  text unique,
  push_sent   int  not null default 0,
  push_failed int  not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_created_idx on public.notifications (created_at desc);

-- Lido/não lido por pessoa da equipe.
create table if not exists public.notification_reads (
  notification_id text not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ---------- RLS ----------
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
revoke all on public.push_subscriptions, public.notifications, public.notification_reads from anon;

-- Cada pessoa da equipe vê e gerencia só os próprios dispositivos.
drop policy if exists "proprios_dispositivos" on public.push_subscriptions;
create policy "proprios_dispositivos" on public.push_subscriptions for all to authenticated
  using ((select public.is_staff()) and user_id = (select auth.uid()))
  with check ((select public.is_staff()) and user_id = (select auth.uid()));
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Notificações: a equipe lê todas. Criação e envio só pelo servidor (service role),
-- que também remove inscrições expiradas (404/410) de qualquer usuário.
drop policy if exists "equipe_le" on public.notifications;
create policy "equipe_le" on public.notifications for select to authenticated using ((select public.is_staff()));
grant select on public.notifications to authenticated;

drop policy if exists "proprias_leituras" on public.notification_reads;
create policy "proprias_leituras" on public.notification_reads for all to authenticated
  using ((select public.is_staff()) and user_id = (select auth.uid()))
  with check ((select public.is_staff()) and user_id = (select auth.uid()));
grant select, insert, delete on public.notification_reads to authenticated;

-- Limpeza: histórico com mais de 180 dias (chamado pelo cron diário).
create or replace function public.prune_notifications() returns void
language sql security definer set search_path = '' as $$
  delete from public.notifications where created_at < now() - interval '180 days';
$$;
revoke all on function public.prune_notifications() from public, anon, authenticated;
