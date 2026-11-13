-- Autoatendimento do locatário no WhatsApp (mesma instância Whaileys do Copiloto). Somente backend.
begin;
alter table public.copilot_config add column if not exists customer_bot_enabled boolean not null default false;
alter table public.copilot_config add column if not exists charge_buttons_enabled boolean not null default false;
alter table public.copilot_config add column if not exists customer_rate_per_hour integer not null default 30
  check (customer_rate_per_hour between 5 and 200);

-- Sessão por telefone: cliente identificado pelo número cadastrado; verificação (4 primeiros dígitos do CPF) por 24h.
create table if not exists public.customer_bot_sessions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{10,15}$'),
  client_id text references public.clients(id) on delete cascade,
  step text not null default 'menu',
  data jsonb not null default '{}'::jsonb,
  verified_until timestamptz,
  pin_attempts smallint not null default 0,
  pin_locked_until timestamptz,
  expires_at timestamptz not null default now() + interval '30 minutes',
  primary key (organization_id, phone)
);

-- Janela de respostas por telefone (proteção do chip contra bloqueio).
create table if not exists public.customer_bot_rate (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null,
  window_start timestamptz not null default date_trunc('hour', now()),
  replies integer not null default 0,
  warned boolean not null default false,
  primary key (organization_id, phone)
);

-- Interessados (visitante "Quero alugar"): não cria cliente sem CPF; a equipe acompanha.
create table if not exists public.customer_bot_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{10,15}$'),
  name text not null check (char_length(name) between 2 and 80),
  vehicle_id text references public.vehicles(id) on delete set null,
  start_date date,
  end_date date,
  status text not null default 'new' check (status in ('new','contacted','converted','discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Um lead aberto por telefone: nova escolha atualiza o mesmo registro.
create unique index if not exists customer_bot_leads_open_key on public.customer_bot_leads (organization_id, phone) where status in ('new','contacted');

do $$ declare t text; begin
  foreach t in array array['customer_bot_sessions','customer_bot_rate','customer_bot_leads'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- Conta uma resposta e diz se ainda pode responder nesta hora. 'warn' = avisar uma única vez.
create or replace function public.customer_bot_take(p_org uuid, p_phone text, p_limit integer)
returns text language plpgsql security definer set search_path = '' as $take$
declare r public.customer_bot_rate;
begin
  insert into public.customer_bot_rate(organization_id, phone) values (p_org, p_phone) on conflict do nothing;
  select * into r from public.customer_bot_rate where organization_id = p_org and phone = p_phone for update;
  if r.window_start < date_trunc('hour', now()) then
    update public.customer_bot_rate set window_start = date_trunc('hour', now()), replies = 1, warned = false where organization_id = p_org and phone = p_phone;
    return 'ok';
  end if;
  if r.replies < p_limit then
    update public.customer_bot_rate set replies = replies + 1 where organization_id = p_org and phone = p_phone;
    return 'ok';
  end if;
  if not r.warned then
    update public.customer_bot_rate set warned = true where organization_id = p_org and phone = p_phone;
    return 'warn';
  end if;
  return 'blocked';
end $take$;

-- Verificação: 5 erros bloqueiam 30 min. O PIN nunca é gravado; só o resultado da comparação.
create or replace function public.customer_bot_pin(p_org uuid, p_phone text, p_ok boolean)
returns text language plpgsql security definer set search_path = '' as $pin$
declare s public.customer_bot_sessions;
begin
  select * into s from public.customer_bot_sessions where organization_id = p_org and phone = p_phone for update;
  if not found then return 'no_session'; end if;
  if s.pin_locked_until > now() then return 'locked'; end if;
  if p_ok then
    update public.customer_bot_sessions set verified_until = now() + interval '24 hours', pin_attempts = 0, pin_locked_until = null
     where organization_id = p_org and phone = p_phone;
    return 'verified';
  end if;
  update public.customer_bot_sessions set pin_attempts = case when s.pin_attempts + 1 >= 5 then 0 else s.pin_attempts + 1 end,
    pin_locked_until = case when s.pin_attempts + 1 >= 5 then now() + interval '30 minutes' else null end
   where organization_id = p_org and phone = p_phone;
  return case when s.pin_attempts + 1 >= 5 then 'locked' else 'wrong' end;
end $pin$;

revoke all on function public.customer_bot_take(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.customer_bot_take(uuid,text,integer) to service_role;
revoke all on function public.customer_bot_pin(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.customer_bot_pin(uuid,text,boolean) to service_role;
commit;
