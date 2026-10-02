-- LOCAKAR — Correção de segurança: vínculo conta ↔ cliente.
-- Antes: ensure_client_for_current_user() vinculava por CPF OU e-mail, sem e-mail confirmado.
-- Quem soubesse o CPF de um cliente criava uma conta com esse CPF e via os dados dele.
-- Agora: e-mail confirmado + e-mail E CPF iguais ao cadastro. Sem correspondência, cria cliente novo
-- só se o CPF ainda não existir (nunca "rouba" um registro existente). Idempotente.

create or replace function public.ensure_client_for_current_user() returns text
language plpgsql security definer set search_path = '' as $$
declare
  u auth.users;
  v_id text;
  v_cpf text;
  v_name text;
  v_phone text;
begin
  select * into u from auth.users where id = (select auth.uid());
  if u.id is null or u.email_confirmed_at is null or coalesce(u.email, '') = '' then
    return null;
  end if;

  select id into v_id from public.clients where user_id = u.id limit 1;
  if v_id is not null then return v_id; end if;

  v_cpf := regexp_replace(coalesce(u.raw_user_meta_data->>'cpf', ''), '\D', '', 'g');
  if length(v_cpf) <> 11 then return null; end if;
  v_name := coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1));
  v_phone := coalesce(nullif(trim(u.raw_user_meta_data->>'phone'), ''), '');

  -- Cliente já cadastrado pela locadora: exige os dois (e-mail confirmado e CPF)
  update public.clients
     set user_id = u.id, updated_at = now()
   where user_id is null
     and lower(email) = lower(u.email)
     and regexp_replace(cpf, '\D', '', 'g') = v_cpf
  returning id into v_id;
  if v_id is not null then return v_id; end if;

  -- CPF já existe com outro e-mail ou já vinculado: não cria duplicado nem vincula. A equipe resolve.
  if exists (select 1 from public.clients where regexp_replace(cpf, '\D', '', 'g') = v_cpf) then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('clients.code'));
  insert into public.clients (code, name, email, phone, cpf, user_id, registered_at)
  values (coalesce((select max(code) from public.clients), 0) + 1, v_name, u.email, v_phone, v_cpf, u.id, current_date)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.ensure_client_for_current_user() from public, anon;
grant execute on function public.ensure_client_for_current_user() to authenticated;
