-- LOCAKAR — Correções de segurança do App do Locatário.
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
-- Requer 20260930000000_locatario_app_schema.sql.

-- ============================================================================
-- 1. VÍNCULO CONTA ↔ CLIENTE SÓ COM E-MAIL CONFIRMADO
-- ============================================================================
-- Antes: o vínculo era feito pelo CPF informado no cadastro, sem confirmar nada.
-- Quem soubesse o CPF de um cliente veria os dados dele. Agora é preciso:
--   (1) e-mail confirmado (o Supabase exige clicar no link recebido) e
--   (2) esse e-mail ser o mesmo cadastrado pela LOCAKAR no cliente e
--   (3) o CPF informado no cadastro bater com o do cliente.
drop trigger if exists on_auth_user_created_link_client on auth.users;
drop function if exists public.handle_client_user_link();

create or replace function public.link_current_user_to_client() returns text
language plpgsql security definer set search_path = '' as $$
declare
  u auth.users;
  v_id text;
begin
  select * into u from auth.users where id = (select auth.uid());
  if u.id is null or u.email_confirmed_at is null or coalesce(u.email, '') = '' then
    return null;
  end if;

  select id into v_id from public.clients where user_id = u.id;
  if v_id is not null then
    return v_id;
  end if;

  update public.clients
     set user_id = u.id, updated_at = now()
   where user_id is null
     and lower(email) = lower(u.email)
     and regexp_replace(cpf, '\D', '', 'g') = regexp_replace(coalesce(u.raw_user_meta_data->>'cpf', ''), '\D', '', 'g')
  returning id into v_id;

  return v_id;
end $$;
revoke all on function public.link_current_user_to_client() from public, anon;
grant execute on function public.link_current_user_to_client() to authenticated;

-- ============================================================================
-- 2. MENOS PERMISSÕES PARA O LOCATÁRIO
-- ============================================================================

-- Cadastro: o locatário não altera os próprios dados (CPF, CNH...). Alteração passa pela LOCAKAR.
drop policy if exists "locatario_atualiza_proprio_perfil" on public.clients;

-- Veículos: a tabela tem valor de compra, IPVA e Renavam. O locatário lê só pela view abaixo.
drop policy if exists "locatario_le_veiculos" on public.vehicles;

-- Contratos: a tabela tem selfie, assinatura e token. Fica só com a equipe (o cliente usa o link de assinatura).
drop policy if exists "locatario_le_proprios_contratos" on public.contracts;

-- Comprovantes: o registro passa a ser criado só pelo servidor (/api/tenant/receipts),
-- que confere se a locação e a parcela são do cliente e calcula o valor. O locatário só lê.
drop policy if exists "locatario_envia_comprovante" on public.payment_receipts;

-- Um comprovante em análise por parcela: tocar duas vezes em "Enviar" não duplica.
create unique index if not exists payment_receipts_one_pending_idx
  on public.payment_receipts (rental_id, receipt_id)
  where status = 'pending_review';

-- Consentimentos: registro probatório (LGPD). O locatário registra e consulta; não apaga nem altera.
drop policy if exists "locatario_gerencia_proprio_consentimento" on public.tenant_consents;
drop policy if exists "locatario_le_proprio_consentimento" on public.tenant_consents;
create policy "locatario_le_proprio_consentimento" on public.tenant_consents
  for select to authenticated using (client_id = public.current_client_id());
drop policy if exists "locatario_registra_consentimento" on public.tenant_consents;
create policy "locatario_registra_consentimento" on public.tenant_consents
  for insert to authenticated with check (client_id = public.current_client_id());

-- ============================================================================
-- 3. VIEW SEGURA DE VEÍCULOS
-- ============================================================================
-- Só os carros das locações do próprio cliente, sem dados internos (compra, IPVA, Renavam, observações).
-- View executada com as permissões do dono: o filtro por current_client_id() é o controle de acesso.
create or replace view public.tenant_vehicles as
  select v.id, v.name, v.brand, v.model, v.year, v.year_model, v.plate, v.image, v.fuel,
         v.transmission, v.seats, v.air_conditioning, v.category
    from public.vehicles v
   where v.id in (select r.vehicle_id from public.rentals r where r.client_id = public.current_client_id());

revoke all on public.tenant_vehicles, public.client_vehicle_maintenance from anon;
grant select on public.tenant_vehicles, public.client_vehicle_maintenance to authenticated;
