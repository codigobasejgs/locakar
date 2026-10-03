-- LOCAKAR — InfinitePay (InfiniteTap + Checkout Integrado).
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
--
-- As parcelas continuam em rentals.receipts (fonte do Financeiro). Esta tabela guarda só as
-- TENTATIVAS de cobrança na InfinitePay: o id é o order_id (Tap) / order_nsu (Checkout),
-- e liga InfinitePay → tentativa → parcela → locação → cliente. Nenhum dado de cartão é salvo.

create table if not exists public.payment_transactions (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null default 'infinitepay' check (provider in ('infinitepay')),
  flow               text not null check (flow in ('tap', 'checkout')),
  rental_id          text not null references public.rentals(id) on delete cascade,
  receipt_id         text not null,
  client_id          text not null references public.clients(id) on delete cascade,
  amount_cents       int  not null check (amount_cents >= 100),
  method             text check (method in ('credit', 'debit', 'pix', 'credit_card')),
  installments       int  check (installments between 1 and 12),
  status             text not null default 'started'
                     check (status in ('started', 'link_created', 'awaiting_confirmation', 'paid', 'failed', 'cancelled', 'amount_mismatch')),
  handle             text,
  -- Checkout
  checkout_url       text,
  webhook_token      text,
  invoice_slug       text,
  transaction_nsu    text,
  capture_method     text,
  paid_amount_cents  int,
  receipt_url        text,
  -- InfiniteTap (retorno do result_url)
  nsu                text,
  authorization_code text,
  card_brand         text,
  merchant_document  text,
  ip_user_id         text,
  ip_access_id       text,
  warning            text,
  -- Quem iniciou e de onde
  operator_id        uuid references auth.users(id) on delete set null,
  device             text,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  paid_at            timestamptz
);

-- Idempotência: o mesmo transaction_nsu / NSU nunca vale para duas tentativas.
create unique index if not exists payment_transactions_tnsu_idx on public.payment_transactions (provider, transaction_nsu) where transaction_nsu is not null;
create unique index if not exists payment_transactions_nsu_idx on public.payment_transactions (provider, nsu) where nsu is not null;
-- Uma parcela só pode ser quitada por uma tentativa.
create unique index if not exists payment_transactions_paid_idx on public.payment_transactions (rental_id, receipt_id) where status = 'paid';
create index if not exists payment_transactions_receipt_idx on public.payment_transactions (rental_id, receipt_id, created_at desc);

drop trigger if exists set_updated_at on public.payment_transactions;
create trigger set_updated_at before update on public.payment_transactions for each row execute function public.set_updated_at();

-- Só a equipe lê; só o servidor (service role) grava. O webhook_token nunca sai do servidor.
alter table public.payment_transactions enable row level security;
revoke all on public.payment_transactions from anon, authenticated;
grant select (id, provider, flow, rental_id, receipt_id, client_id, amount_cents, method, installments, status, handle,
              checkout_url, invoice_slug, transaction_nsu, capture_method, paid_amount_cents, receipt_url, nsu,
              authorization_code, card_brand, merchant_document, warning, operator_id, last_error, created_at, updated_at, paid_at)
  on public.payment_transactions to authenticated;
drop policy if exists "equipe_le" on public.payment_transactions;
create policy "equipe_le" on public.payment_transactions for select to authenticated using ((select public.is_staff()));
