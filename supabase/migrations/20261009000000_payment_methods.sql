-- Central de meios: mantém settings / asaas_config existentes, sem financeiro paralelo.
begin;

-- Toggle de PIX/InfinitePay atômico: altera apenas enabled, não sobrescreve o JSON de outra aba.
create or replace function public.set_payment_method_enabled(p_method text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_method not in ('pix_manual', 'infinitepay') or p_enabled is null then
    raise exception 'Meio inválido';
  end if;
  update public.settings set data = jsonb_set(
    data,
    array[case when p_method = 'pix_manual' then 'pix' else 'infinitepay' end],
    coalesce(data -> (case when p_method = 'pix_manual' then 'pix' else 'infinitepay' end), '{}'::jsonb)
      || jsonb_build_object('enabled', p_enabled), true
  ) where id = 1;
  if not found then raise exception 'Settings ausente'; end if;
end;
$$;
revoke all on function public.set_payment_method_enabled(text, boolean) from public, anon, authenticated;
grant execute on function public.set_payment_method_enabled(text, boolean) to service_role;

-- Salvar o formulário geral não desfaz toggles de outra aba, nem permite ativar via client Supabase.
-- Os toggles passam pelo backend (service_role) após requireStaff e validação dos pré-requisitos.
create or replace function public.preserve_payment_method_flags()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    new.data = jsonb_set(new.data, '{pix}', coalesce(new.data->'pix', '{}'::jsonb)
      || jsonb_build_object('enabled', case when TG_OP = 'UPDATE' then coalesce(old.data#>'{pix,enabled}', 'true'::jsonb) else 'true'::jsonb end), true);
    new.data = jsonb_set(new.data, '{infinitepay}', coalesce(new.data->'infinitepay', '{}'::jsonb)
      || jsonb_build_object('enabled', case when TG_OP = 'UPDATE' then coalesce(old.data#>'{infinitepay,enabled}', 'false'::jsonb) else 'false'::jsonb end), true);
  end if;
  return new;
end;
$$;
drop trigger if exists preserve_payment_method_flags on public.settings;
create trigger preserve_payment_method_flags before insert or update on public.settings
for each row execute function public.preserve_payment_method_flags();

-- Mesmo bucket privado, agora permite comprovante PDF além de JPG/PNG.
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
where id = 'comprovantes';

commit;
