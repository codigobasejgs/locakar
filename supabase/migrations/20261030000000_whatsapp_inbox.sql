-- Conversas do WhatsApp no painel (Evolution e Whaileys): modo de atendimento e etiquetas por contato,
-- e histórico das mensagens que passam pelos webhooks (o motor Whaileys não guarda histórico).
-- Somente servidor (service_role); o painel lê pela rota /api/whatsapp/inbox com requireStaff.
begin;

create table if not exists public.whatsapp_conversations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider        text not null check (provider in ('evolution', 'whaileys')),
  jid             text not null check (jid ~ '^[0-9]{6,25}@(s\.whatsapp\.net|lid)$'),
  phone           text check (phone ~ '^[0-9]{10,15}$'),
  name            text check (length(name) <= 120),
  -- human: só pessoas respondem (pausa o robô); buttons: autoatendimento por menu; ai: assistente virtual.
  -- Respostas automáticas só saem com o Autoatendimento de clientes ligado (chave geral em Configurações).
  -- Padrão por provedor (gravado pela aplicação): Whaileys = buttons (como já funcionava); Evolution = human (nunca respondia sozinho).
  mode            text not null default 'human' check (mode in ('human', 'buttons', 'ai')),
  labels          text[] not null default '{}' check (cardinality(labels) <= 10),
  last_text       text check (length(last_text) <= 500),
  last_at         timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, provider, jid)
);
create index if not exists whatsapp_conversations_recent_idx on public.whatsapp_conversations (organization_id, provider, last_at desc nulls last);

create table if not exists public.whatsapp_messages (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider        text not null check (provider in ('evolution', 'whaileys')),
  jid             text not null,
  provider_id     text not null,
  from_me         boolean not null,
  text            text not null check (length(text) <= 4096),
  at              timestamptz not null default now(),
  unique (organization_id, provider, provider_id),
  foreign key (organization_id, provider, jid) references public.whatsapp_conversations (organization_id, provider, jid) on delete cascade
);
create index if not exists whatsapp_messages_thread_idx on public.whatsapp_messages (organization_id, provider, jid, at desc);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_conversations, public.whatsapp_messages from public, anon, authenticated;
grant all on public.whatsapp_conversations, public.whatsapp_messages to service_role;

commit;
