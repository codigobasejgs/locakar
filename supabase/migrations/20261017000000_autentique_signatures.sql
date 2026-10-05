-- Assinatura eletrônica externa (Autentique), sem criar outro sistema de contratos.
-- O contrato LOCAKAR continua em public.contracts; este schema guarda só o processo externo e evidências.
-- Rodar uma vez no SQL Editor. Idempotente.

begin;

create table if not exists public.signature_provider_config (
  organization_id              uuid primary key references public.organizations(id) on delete cascade,
  provider                     text not null default 'autentique' check (provider = 'autentique'),
  enabled                      boolean not null default false,
  environment                  text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  sandbox_token_enc            text,
  sandbox_token_last4          text,
  sandbox_verified_at          timestamptz,
  production_token_enc         text,
  production_token_last4       text,
  production_verified_at       timestamptz,
  webhook_secret_enc           text,
  autentique_organization_id   bigint,
  sortable                     boolean not null default true,
  reminder                     text check (reminder is null or reminder in ('DAILY', 'WEEKLY')),
  company_signer_email         text check (company_signer_email is null or company_signer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  last_error                   text check (last_error is null or char_length(last_error) <= 500),
  updated_by                   uuid,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create table if not exists public.contract_signature_processes (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  contract_id           text not null references public.contracts(id) on delete restrict,
  provider              text not null default 'autentique' check (provider = 'autentique'),
  environment           text not null check (environment in ('sandbox', 'production')),
  provider_document_id  text,
  status                text not null default 'sending'
                        check (status in ('sending', 'awaiting_signature', 'partially_signed', 'completed', 'rejected', 'expired', 'cancelled', 'error')),
  original_pdf_path     text not null,
  original_sha256       text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  signed_pdf_path       text,
  signed_sha256         text check (signed_sha256 is null or signed_sha256 ~ '^[0-9a-f]{64}$'),
  last_error            text check (last_error is null or char_length(last_error) <= 500),
  last_synced_at        timestamptz,
  sent_at               timestamptz,
  completed_at          timestamptz,
  cancelled_at          timestamptz,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists contract_signature_one_active_idx
  on public.contract_signature_processes (contract_id)
  where status in ('sending', 'awaiting_signature', 'partially_signed');
create unique index if not exists contract_signature_provider_doc_idx
  on public.contract_signature_processes (provider, provider_document_id)
  where provider_document_id is not null;
create index if not exists contract_signature_org_contract_idx on public.contract_signature_processes (organization_id, contract_id, created_at desc);

create table if not exists public.contract_signers (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  process_id           uuid not null references public.contract_signature_processes(id) on delete cascade,
  role                 text not null check (role in ('client', 'company', 'witness')),
  sign_order           int not null check (sign_order between 1 and 20),
  action               text not null default 'SIGN' check (action in ('SIGN', 'SIGN_AS_A_WITNESS')),
  provider_public_id   text,
  name                 text not null check (char_length(name) between 2 and 160),
  email                text,
  phone_last4          text check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$'),
  status               text not null default 'pending' check (status in ('pending', 'viewed', 'signed', 'rejected')),
  viewed_at            timestamptz,
  signed_at            timestamptz,
  rejected_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (process_id, sign_order)
);
create unique index if not exists contract_signers_public_idx on public.contract_signers (process_id, provider_public_id) where provider_public_id is not null;

create table if not exists public.signature_events (
  provider_event_id     text primary key check (char_length(provider_event_id) between 8 and 120),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  process_id            uuid references public.contract_signature_processes(id) on delete set null,
  provider_document_id  text,
  event_type            text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  occurred_at           timestamptz,
  status                text not null default 'pending' check (status in ('pending', 'processing', 'done', 'ignored', 'error')),
  error                 text check (error is null or char_length(error) <= 300),
  received_at           timestamptz not null default now(),
  processed_at          timestamptz
);
create index if not exists signature_events_process_idx on public.signature_events (organization_id, process_id, occurred_at);

alter table public.signature_provider_config enable row level security;
alter table public.contract_signature_processes enable row level security;
alter table public.contract_signers enable row level security;
alter table public.signature_events enable row level security;

drop policy if exists org_read on public.contract_signature_processes;
drop policy if exists org_read on public.contract_signers;
drop policy if exists org_read on public.signature_events;
create policy org_read on public.contract_signature_processes for select to authenticated using (organization_id = (select public.current_org_id()));
create policy org_read on public.contract_signers for select to authenticated using (organization_id = (select public.current_org_id()));
create policy org_read on public.signature_events for select to authenticated using (organization_id = (select public.current_org_id()));

revoke all on public.signature_provider_config from public, anon, authenticated;
revoke all on public.contract_signature_processes, public.contract_signers, public.signature_events from public, anon;
revoke insert, update, delete on public.contract_signature_processes, public.contract_signers, public.signature_events from authenticated;
grant select on public.contract_signature_processes, public.contract_signers, public.signature_events to authenticated;
grant all on public.signature_provider_config, public.contract_signature_processes, public.contract_signers, public.signature_events to service_role;

-- Enquanto houver envio ativo na Autentique, o contrato não é assinado pelo link próprio nem cancelado localmente.
-- O status "signed" só é gravado pelo servidor depois que o processo externo foi concluído.
create or replace function public.contracts_external_signature_guard() returns trigger
language plpgsql set search_path = '' as $
begin
  if new.status is distinct from old.status and exists (
    select 1 from public.contract_signature_processes p
    where p.contract_id = old.id and p.status in ('sending', 'awaiting_signature', 'partially_signed')
  ) then
    raise exception 'Este contrato está em assinatura pela Autentique. Cancele o envio antes de alterar.' using errcode = 'P0001';
  end if;
  return new;
end $;
drop trigger if exists contracts_external_signature_guard on public.contracts;
create trigger contracts_external_signature_guard before update of status on public.contracts
  for each row execute function public.contracts_external_signature_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contratos', 'contratos', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

commit;
