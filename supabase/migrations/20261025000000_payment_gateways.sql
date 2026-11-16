-- Gateways de link de pagamento: Mercado Pago, PagBank e Pagar.me (Stone). Somente servidor.
-- Mesmo modelo da InfinitePay/Asaas: a parcela continua em rentals.receipts; cada tentativa é uma linha
-- de payment_transactions (flow = 'checkout'); a baixa só acontece depois de consultar a API do gateway.
begin;

alter table public.payment_transactions drop constraint if exists payment_transactions_provider_check;
alter table public.payment_transactions add constraint payment_transactions_provider_check
  check (provider in ('infinitepay', 'asaas', 'mercadopago', 'pagbank', 'pagarme'));
alter table public.payment_transactions drop constraint if exists payment_transactions_method_check;
alter table public.payment_transactions add constraint payment_transactions_method_check
  check (method in ('credit', 'debit', 'pix', 'credit_card', 'boleto'));

-- Credenciais cifradas (AES-256-GCM, chave mestra só no ambiente). Nada disso é lido pelo navegador/app.
create table if not exists public.payment_gateways (
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  provider            text not null check (provider in ('mercadopago', 'pagbank', 'pagarme')),
  enabled             boolean not null default false,
  environment         text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  credential_enc      text,
  credential_last4    text,
  -- Mercado Pago: assinatura secreta dos webhooks (informada pela locadora).
  -- Pagar.me: token aleatório da URL de webhook (gerado aqui; a URL é mostrada para colar no dashboard).
  webhook_secret_enc  text,
  verified_at         timestamptz,
  last_error          text,
  updated_by          uuid references auth.users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  primary key (organization_id, provider)
);

alter table public.payment_gateways enable row level security;
revoke all on public.payment_gateways from public, anon, authenticated;
grant all on public.payment_gateways to service_role;

commit;
