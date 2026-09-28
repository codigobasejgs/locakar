-- LOCAKAR — Web Push para o cliente + alertas da empresa por e-mail/WhatsApp.
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
-- Requer 20260928000000_web_push.sql.

-- ---------- Dispositivos do cliente ----------
-- O cliente não tem login: ativa as notificações na página do contrato (/assinar/<token>).
-- O servidor valida o token e grava aqui com a service role. Ninguém de fora lê nem escreve.
create table if not exists public.client_push_subscriptions (
  id           text primary key default gen_random_uuid()::text,
  client_id    text not null references public.clients(id) on delete cascade,
  endpoint     text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh       text not null check (length(p256dh) between 40 and 200),
  auth         text not null check (length(auth) between 10 and 100),
  user_agent   text,
  failures     int  not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists client_push_subscriptions_client_idx on public.client_push_subscriptions (client_id);

alter table public.client_push_subscriptions enable row level security;
revoke all on public.client_push_subscriptions from anon;
-- A equipe pode ver quantos dispositivos cada cliente ativou (sem política de escrita: só o servidor grava).
drop policy if exists "equipe_le" on public.client_push_subscriptions;
create policy "equipe_le" on public.client_push_subscriptions for select to authenticated using ((select public.is_staff()));
grant select on public.client_push_subscriptions to authenticated;

-- Cliente do contrato pelo token do link (usado só pelo servidor, com a service role).
create or replace function public.client_for_token(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select r.client_id from public.contracts c join public.rentals r on r.id = c.rental_id
  where length(coalesce(p_token, '')) >= 32 and c.token = p_token and c.status <> 'cancelled';
$$;
revoke all on function public.client_for_token(text) from public, anon, authenticated;
