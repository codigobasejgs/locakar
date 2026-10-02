-- LOCAKAR SaaS — Fase final: rodar SOMENTE depois de 20261013000100_saas_tenancy.sql E do código
-- multiempresa publicado na Vercel. Desliga o "cai na LOCAKAR" de registros sem locadora: a partir
-- daqui, gravação sem organização falha (fail-closed). Remove as RPCs da versão monoempresa.
-- Reversível: update platform_config set legacy_fallback = true where id = 1;

begin;
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'platform_config' and column_name = 'legacy_fallback') then
    raise exception 'Rode 20261013000100_saas_tenancy.sql e publique o código antes desta migration.';
  end if;
end $$;
update public.platform_config set legacy_fallback = false, updated_at = now() where id = 1;
drop function if exists public.set_payment_method_enabled(text, boolean);
drop function if exists public.reserve_selsyn_request(uuid, uuid, text, text);
commit;
