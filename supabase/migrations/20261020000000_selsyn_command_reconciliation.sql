-- Reconciliação somente leitura do comando já enviado. Preserva todas as intenções e bloqueios pendentes.
begin;
alter table public.selsyn_commands
  add column if not exists provider_returned_at timestamptz,
  add column if not exists provider_device_id text,
  add column if not exists provider_result text,
  add column if not exists last_checked_at timestamptz,
  add column if not exists reconciliation_error text;
commit;
