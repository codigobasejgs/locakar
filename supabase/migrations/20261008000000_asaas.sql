-- LOCAKAR — Asaas (provider opcional de cobrança: Pix, boleto, cartão e fatura).
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
--
-- As parcelas continuam em rentals.receipts (fonte do Financeiro). As cobranças Asaas usam a mesma
-- tabela de tentativas da InfinitePay (payment_transactions, provider = 'asaas'): não existe financeiro paralelo.
-- Segredos (API Key cifrada, hash do token do webhook) ficam em asaas_config, acessível só pelo servidor.

begin;

-- ---------- payment_transactions: provider asaas ----------
alter table public.payment_transactions drop constraint if exists payment_transactions_provider_check;
alter table public.payment_transactions add constraint payment_transactions_provider_check check (provider in ('infinitepay', 'asaas'));
alter table public.payment_transactions drop constraint if exists payment_transactions_flow_check;
alter table public.payment_transactions add constraint payment_transactions_flow_check check (flow in ('tap', 'checkout', 'charge'));
alter table public.payment_transactions drop constraint if exists payment_transactions_status_check;
alter table public.payment_transactions add constraint payment_transactions_status_check
  check (status in ('started', 'link_created', 'awaiting_confirmation', 'paid', 'failed', 'cancelled', 'amount_mismatch', 'refunded', 'chargeback'));

alter table public.payment_transactions
  add column if not exists environment         text check (environment in ('sandbox', 'production')),
  add column if not exists provider_payment_id text,
  add column if not exists provider_customer_id text,
  add column if not exists external_reference  text,
  add column if not exists billing_type        text,
  add column if not exists provider_status     text,
  add column if not exists invoice_url         text,
  add column if not exists bank_slip_url       text,
  add column if not exists due_date            date,
  add column if not exists refunded_cents      int not null default 0,
  add column if not exists chargeback_status   text,
  add column if not exists provider_updated_at timestamptz;

-- Uma cobrança Asaas por ID do Asaas; no máximo uma cobrança Asaas ativa (criando/aberta) por parcela.
create unique index if not exists payment_transactions_provider_payment_idx on public.payment_transactions (provider, provider_payment_id) where provider_payment_id is not null;
create unique index if not exists payment_transactions_asaas_active_idx on public.payment_transactions (rental_id, receipt_id)
  where provider = 'asaas' and status in ('started', 'link_created');
create index if not exists payment_transactions_external_ref_idx on public.payment_transactions (external_reference) where external_reference is not null;

grant select (environment, provider_payment_id, provider_customer_id, external_reference, billing_type, provider_status, invoice_url,
              bank_slip_url, due_date, refunded_cents, chargeback_status, provider_updated_at)
  on public.payment_transactions to authenticated;

-- ---------- Configuração (uma linha, só servidor) ----------
create table if not exists public.asaas_config (
  id                        int primary key default 1 check (id = 1),
  enabled                   boolean not null default false,
  environment               text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  methods                   text[] not null default array['PIX', 'BOLETO', 'CREDIT_CARD']::text[],
  allow_undefined           boolean not null default true,
  fine_percent              numeric(6,2) check (fine_percent is null or (fine_percent >= 0 and fine_percent <= 100)),
  interest_percent          numeric(6,2) check (interest_percent is null or (interest_percent >= 0 and interest_percent <= 100)),
  discount_percent          numeric(6,2) check (discount_percent is null or (discount_percent > 0 and discount_percent < 100)),
  discount_days             int check (discount_days is null or discount_days between 0 and 60),
  notify_asaas              boolean not null default false,
  notify_whatsapp           boolean not null default true,
  notify_email              boolean not null default false,
  sandbox_key_enc           text,
  sandbox_key_last4         text,
  sandbox_verified_at       timestamptz,
  sandbox_webhook_id        text,
  sandbox_webhook_hash      text,
  production_key_enc        text,
  production_key_last4      text,
  production_verified_at    timestamptz,
  production_webhook_id     text,
  production_webhook_hash   text,
  last_error                text,
  updated_by                uuid references auth.users(id) on delete set null,
  updated_at                timestamptz not null default now()
);
insert into public.asaas_config (id) values (1) on conflict (id) do nothing;

-- ---------- Cliente LOCAKAR ↔ cliente Asaas (por ambiente: IDs do Sandbox não valem em Produção) ----------
create table if not exists public.asaas_customers (
  client_id   text not null references public.clients(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  customer_id text not null,
  created_at  timestamptz not null default now(),
  primary key (client_id, environment)
);

-- ---------- Webhooks recebidos: event.id único = idempotência ----------
create table if not exists public.asaas_webhook_events (
  id           text primary key,
  environment  text not null check (environment in ('sandbox', 'production')),
  event        text not null,
  payment_id   text,
  payload      jsonb not null,
  status       text not null default 'pending' check (status in ('pending', 'processing', 'done', 'ignored', 'error')),
  attempts     int not null default 0,
  last_error   text,
  received_at  timestamptz not null default now(),
  locked_at    timestamptz,
  processed_at timestamptz
);
create index if not exists asaas_webhook_events_pending_idx on public.asaas_webhook_events (status, received_at) where status in ('pending', 'processing', 'error');

drop trigger if exists set_updated_at on public.asaas_config;
create trigger set_updated_at before update on public.asaas_config for each row execute function public.set_updated_at();

-- Nenhuma dessas tabelas é lida pelo navegador/app: RLS ligada, sem políticas, sem grants (só service_role).
do $$
declare t text;
begin
  foreach t in array array['asaas_config', 'asaas_customers', 'asaas_webhook_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

commit;
