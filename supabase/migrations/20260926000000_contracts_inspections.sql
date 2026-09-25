-- LOCAKAR — contratos com assinatura eletrônica, vistorias de entrega/devolução e histórico de e-mails.
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
-- Requer a migração 20260925000000_init.sql (tabelas, staff, is_staff).

create extension if not exists pgcrypto with schema extensions;

-- ---------- Campos novos ----------
alter table public.clients add column if not exists email text;
alter table public.rentals add column if not exists delivery_inspection jsonb;  -- entrega (check-out)
alter table public.rentals add column if not exists return_inspection jsonb;    -- devolução (check-in)

-- ---------- Contratos ----------
create table if not exists public.contracts (
  id                 text primary key default gen_random_uuid()::text,
  rental_id          text not null references public.rentals(id) on delete restrict,
  status             text not null default 'pending' check (status in ('pending','signed','cancelled')),
  token              text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  content            text not null,
  content_hash       text,
  client_name        text not null,
  client_cpf         text not null,
  client_email       text,
  company_signer     text,
  company_signature  text,
  company_email      text,
  issued_at          timestamptz not null default now(),
  expires_at         timestamptz default now() + interval '30 days',
  signed_name        text,
  signed_cpf         text,
  signature          text,
  signed_at          timestamptz,
  signed_ip          text,
  signed_user_agent  text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists contracts_rental_idx on public.contracts (rental_id);

-- Integridade da prova: conteúdo imutável, hash calculado no banco, assinatura só via sign_contract().
create or replace function public.contracts_guard() returns trigger
language plpgsql set search_path = '' as $$
declare via_api boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    new.content_hash := encode(extensions.digest(convert_to(new.content, 'UTF8'), 'sha256'), 'hex');
    if via_api then
      new.status := 'pending';
      new.signed_name := null; new.signed_cpf := null; new.signature := null;
      new.signed_at := null; new.signed_ip := null; new.signed_user_agent := null;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'signed' then
      raise exception 'Contrato assinado não pode ser excluído.' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'signed' then
    raise exception 'Contrato assinado não pode ser alterado.' using errcode = 'P0001';
  end if;
  if new.content is distinct from old.content or new.token is distinct from old.token
     or new.content_hash is distinct from old.content_hash or new.rental_id is distinct from old.rental_id then
    raise exception 'O conteúdo do contrato não pode ser alterado. Cancele e gere um novo.' using errcode = 'P0001';
  end if;
  if via_api and (new.status = 'signed' or new.signature is distinct from old.signature
                  or new.signed_at is distinct from old.signed_at) then
    raise exception 'A assinatura só pode ser registrada pelo cliente, no link de assinatura.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists contracts_guard_ins on public.contracts;
drop trigger if exists contracts_guard_upd on public.contracts;
drop trigger if exists contracts_guard_del on public.contracts;
create trigger contracts_guard_ins before insert on public.contracts for each row execute function public.contracts_guard();
create trigger contracts_guard_upd before update on public.contracts for each row execute function public.contracts_guard();
create trigger contracts_guard_del before delete on public.contracts for each row execute function public.contracts_guard();

-- ---------- Histórico de e-mails ----------
create table if not exists public.email_log (
  id          text primary key default gen_random_uuid()::text,
  kind        text not null,
  to_email    text not null,
  subject     text not null,
  rental_id   text references public.rentals(id) on delete set null,
  fine_id     text references public.fines(id) on delete set null,
  contract_id text references public.contracts(id) on delete set null,
  provider_id text,
  status      text not null check (status in ('sent','failed')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists email_log_rental_idx on public.email_log (rental_id, created_at desc);
create index if not exists email_log_fine_idx on public.email_log (fine_id);
create index if not exists email_log_contract_idx on public.email_log (contract_id);

-- ---------- RLS: só a equipe ----------
do $$
declare t text;
begin
  foreach t in array array['contracts','email_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "equipe_total" on public.%I', t);
    execute format('create policy "equipe_total" on public.%I for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Acesso público por token (página /assinar/[token]) ----------
-- Quem tem o link vê somente o próprio contrato. Nenhuma tabela fica exposta ao público.
create or replace function public.contract_for_signing(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', c.status, 'content', c.content, 'contentHash', c.content_hash,
    'clientName', c.client_name, 'companySigner', c.company_signer, 'companySignature', c.company_signature,
    'issuedAt', c.issued_at, 'expiresAt', c.expires_at,
    'signedName', c.signed_name, 'signature', c.signature, 'signedAt', c.signed_at, 'signedIp', c.signed_ip)
  from public.contracts c
  where length(coalesce(p_token, '')) >= 32 and c.token = p_token;
$$;

create or replace function public.sign_contract(
  p_token text, p_name text, p_cpf text, p_signature text, p_ip text, p_user_agent text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  if length(coalesce(p_token, '')) < 32 then
    raise exception 'Contrato não encontrado.' using errcode = 'P0002';
  end if;
  select * into c from public.contracts where token = p_token for update;
  if not found then raise exception 'Contrato não encontrado.' using errcode = 'P0002'; end if;
  if c.status = 'signed' then raise exception 'Este contrato já foi assinado.' using errcode = 'P0001'; end if;
  if c.status <> 'pending' then raise exception 'Este contrato foi cancelado pela locadora.' using errcode = 'P0001'; end if;
  if c.expires_at is not null and c.expires_at < now() then
    raise exception 'O link de assinatura expirou. Peça um novo link à LOCAKAR.' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_name, ''))) < 5 then
    raise exception 'Informe seu nome completo.' using errcode = 'P0001';
  end if;
  if regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') <> regexp_replace(c.client_cpf, '\D', '', 'g') then
    raise exception 'O CPF informado não confere com o do contrato.' using errcode = 'P0001';
  end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 400000 then
    raise exception 'Assinatura inválida. Desenhe novamente.' using errcode = 'P0001';
  end if;

  update public.contracts set
    status = 'signed', signed_name = trim(p_name), signed_cpf = c.client_cpf, signature = p_signature,
    signed_at = now(), signed_ip = left(p_ip, 64), signed_user_agent = left(p_user_agent, 400)
  where id = c.id;

  return jsonb_build_object(
    'id', c.id, 'rentalId', c.rental_id, 'clientName', c.client_name, 'clientEmail', c.client_email,
    'companyEmail', c.company_email, 'contentHash', c.content_hash, 'signedName', trim(p_name), 'signedAt', now());
end $$;

revoke all on function public.contract_for_signing(text) from public;
revoke all on function public.sign_contract(text, text, text, text, text, text) from public;
grant execute on function public.contract_for_signing(text) to anon, authenticated;
grant execute on function public.sign_contract(text, text, text, text, text, text) to anon, authenticated;
