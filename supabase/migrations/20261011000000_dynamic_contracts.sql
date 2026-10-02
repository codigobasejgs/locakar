-- LOCAKAR — Motor Inteligente de Contratos Dinâmicos
-- Idempotente. Modelos de contrato do locador com mapeamento de campos detectados por IA.
-- A IA é chamada apenas na configuração do modelo; a emissão em locações é 100% determinística.

begin;

-- ---------- Tabela de modelos de contrato (máximo 5 ativos) ----------
create table if not exists public.contract_templates (
  id                  text primary key default gen_random_uuid()::text,
  name                text not null,
  rental_type         text not null check (rental_type in ('Semanal', 'Quinzenal', 'Mensal', 'Diário', 'Outro', 'Todos')),
  file_name           text not null,
  file_path           text not null,
  file_type           text not null check (file_type in ('pdf', 'docx')),
  file_hash           text not null,
  status              text not null default 'uploaded'
                      check (status in ('uploaded', 'analyzing', 'review_required', 'configured', 'error', 'inactive')),
  current_version     int not null default 1,
  mapping             jsonb not null default '[]'::jsonb,
  manual_fields       jsonb not null default '[]'::jsonb,
  raw_extracted_text  text,
  last_analyzed_at    timestamptz,
  last_error          text,
  is_default          boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists contract_templates_rental_type_idx on public.contract_templates (rental_type);

-- Histórico de versões do modelo: contratos emitidos com v1 nunca mudam se o template for para v2.
create table if not exists public.contract_template_versions (
  id                  uuid primary key default gen_random_uuid(),
  template_id         text not null references public.contract_templates(id) on delete cascade,
  version             int not null,
  file_path           text not null,
  file_hash           text not null,
  mapping             jsonb not null,
  manual_fields       jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  unique (template_id, version)
);

-- Configuração da IA para análise dos modelos (Gemini/OpenAI, chave cifrada com secret.ts)
create table if not exists public.contract_ai_config (
  id                  int primary key default 1 check (id = 1),
  provider            text not null default 'gemini' check (provider in ('gemini', 'openai')),
  model_name          text not null default 'gemini-3.8-flash',
  key_enc             text,
  key_last4           text,
  verified_at         timestamptz,
  last_error          text,
  updated_at          timestamptz not null default now()
);
insert into public.contract_ai_config (id) values (1) on conflict do nothing;

-- Adiciona snapshot e vínculo de template na tabela contracts existente (retrocompatível)
alter table public.contracts
  add column if not exists template_id text references public.contract_templates(id) on delete set null,
  add column if not exists template_version int,
  add column if not exists resolved_snapshot jsonb,
  add column if not exists manual_values jsonb;

-- RLS: Apenas a equipe acessa modelos e configurações; locatário nunca vê templates/mappings
alter table public.contract_templates enable row level security;
alter table public.contract_template_versions enable row level security;
alter table public.contract_ai_config enable row level security;

do $$
declare t text;
begin
  foreach t in array array['contract_templates', 'contract_template_versions'] loop
    execute format('drop policy if exists "equipe_total" on public.%I', t);
    execute format('create policy "equipe_total" on public.%I for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;

  execute format('drop policy if exists "equipe_total" on public.contract_ai_config');
  execute format('revoke all on public.contract_ai_config from anon, authenticated');
  execute format('grant all on public.contract_ai_config to service_role');
end $$;

commit;
