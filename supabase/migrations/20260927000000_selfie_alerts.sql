-- LOCAKAR — selfie na assinatura do contrato e controle de alertas automáticos por e-mail.
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
-- Requer 20260925000000_init.sql e 20260926000000_contracts_inspections.sql.

-- ---------- Selfie (prova de autoria) ----------
-- Dado biométrico (LGPD art. 11): só a equipe lê (RLS de contracts); nunca vai para a página pública nem por e-mail.
alter table public.contracts add column if not exists selfie text;

-- ---------- Alertas: evita reenviar o mesmo lembrete todo dia ----------
alter table public.email_log add column if not exists alert_keys text[];
create index if not exists email_log_kind_created_idx on public.email_log (kind, created_at desc);

-- ---------- Proteção do contrato agora inclui a selfie ----------
create or replace function public.contracts_guard() returns trigger
language plpgsql set search_path = '' as $$
declare via_api boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    new.content_hash := encode(extensions.digest(convert_to(new.content, 'UTF8'), 'sha256'), 'hex');
    if via_api then
      new.status := 'pending';
      new.signed_name := null; new.signed_cpf := null; new.signature := null; new.selfie := null;
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

  if old.status = 'signed' then
    raise exception 'Contrato assinado não pode ser alterado.' using errcode = 'P0001';
  end if;
  if new.content is distinct from old.content or new.token is distinct from old.token
     or new.content_hash is distinct from old.content_hash or new.rental_id is distinct from old.rental_id then
    raise exception 'O conteúdo do contrato não pode ser alterado. Cancele e gere um novo.' using errcode = 'P0001';
  end if;
  if via_api and (new.status = 'signed' or new.signature is distinct from old.signature
                  or new.selfie is distinct from old.selfie or new.signed_at is distinct from old.signed_at) then
    raise exception 'A assinatura só pode ser registrada pelo cliente, no link de assinatura.' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------- Assinatura passa a exigir selfie ----------
drop function if exists public.sign_contract(text, text, text, text, text, text);

create or replace function public.sign_contract(
  p_token text, p_name text, p_cpf text, p_signature text, p_selfie text, p_ip text, p_user_agent text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v_phone text;
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
  if p_selfie is null or p_selfie not like 'data:image/jpeg;base64,%' or length(p_selfie) < 2000 or length(p_selfie) > 600000 then
    raise exception 'Tire a selfie pela câmera para confirmar sua identidade.' using errcode = 'P0001';
  end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 400000 then
    raise exception 'Assinatura inválida. Desenhe novamente.' using errcode = 'P0001';
  end if;

  update public.contracts set
    status = 'signed', signed_name = trim(p_name), signed_cpf = c.client_cpf, signature = p_signature, selfie = p_selfie,
    signed_at = now(), signed_ip = left(p_ip, 64), signed_user_agent = left(p_user_agent, 400)
  where id = c.id;

  -- Telefone do locatário para a confirmação por WhatsApp (só no retorno de quem acabou de assinar).
  select cl.phone into v_phone from public.rentals r join public.clients cl on cl.id = r.client_id where r.id = c.rental_id;

  return jsonb_build_object(
    'id', c.id, 'rentalId', c.rental_id, 'clientName', c.client_name, 'clientEmail', c.client_email,
    'clientPhone', v_phone, 'companyEmail', c.company_email, 'contentHash', c.content_hash,
    'signedName', trim(p_name), 'signedAt', now());
end $$;

revoke all on function public.sign_contract(text, text, text, text, text, text, text) from public;
grant execute on function public.sign_contract(text, text, text, text, text, text, text) to anon, authenticated;
