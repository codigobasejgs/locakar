-- LOCAKAR SaaS — Fase final: rodar SOMENTE depois que o código multiempresa estiver publicado na Vercel.
-- Desliga o "cai na LOCAKAR" de registros sem locadora: a partir daqui, gravação sem organização falha
-- (fail-closed) em vez de ir silenciosamente para a LOCAKAR. Remove as RPCs da versão monoempresa.
-- Reversível: update platform_config set legacy_fallback = true where id = 1;

begin;
update public.platform_config set legacy_fallback = false, updated_at = now() where id = 1;
drop function if exists public.set_payment_method_enabled(text, boolean);
drop function if exists public.reserve_selsyn_request(uuid, uuid, text, text);
commit;
