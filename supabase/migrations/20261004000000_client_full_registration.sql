-- LOCAKAR — Cadastro completo de clientes (CPF/CNPJ, RG, CNH Digital PDF, KM dia/mês, CEP e endereço detalhado).
-- Rodar uma vez em: Supabase → SQL Editor → New query → colar → Run. Idempotente.
-- Requer migrations anteriores (01 a 08).

-- ============================================================================
-- 1. NOVAS COLUNAS EM CLIENTS
-- ============================================================================
alter table public.clients
  add column if not exists doc_type text not null default 'cpf' check (doc_type in ('cpf', 'cnpj')),
  add column if not exists rg text,
  add column if not exists backup_phone text,
  add column if not exists km_daily int check (km_daily >= 0),
  add column if not exists km_monthly int check (km_monthly >= 0),
  add column if not exists cep text,
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists street text,
  add column if not exists number text,
  add column if not exists complement text,
  add column if not exists neighborhood text,
  add column if not exists cnh_pdf_url text;

-- Bucket documentos aceita application/pdf além de imagens
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
 where id = 'documentos';

-- ============================================================================
-- 2. ATUALIZAR VIEW TENANT_PROFILE
-- ============================================================================
drop view if exists public.tenant_profile;
create view public.tenant_profile as
  select c.id, c.name, c.cpf, c.doc_type, c.rg, c.email, c.phone, c.backup_phone,
         c.km_daily, c.km_monthly, c.cep, c.state, c.city, c.street, c.number,
         c.complement, c.neighborhood, c.cnh_expiry, c.cnh_number, c.cnh_category,
         c.cnh_front_url, c.cnh_back_url, c.cnh_pdf_url, c.address_proof_url
    from public.clients c
   where c.user_id = (select auth.uid());

revoke all on public.tenant_profile from anon;
grant select on public.tenant_profile to authenticated;
