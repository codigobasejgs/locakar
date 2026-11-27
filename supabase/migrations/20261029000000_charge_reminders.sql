-- Lembrete de cobrança: no máximo um por parcela por dia, mesmo com execuções concorrentes do cron.
-- O cron reserva (insert) a linha ANTES de enviar; a chave primária barra a segunda execução.
-- Se o envio falhar por completo, a reserva é apagada para permitir nova tentativa.
begin;

create table if not exists public.charge_reminders (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_id      text not null,
  day             date not null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, receipt_id, day)
);

alter table public.charge_reminders enable row level security;
revoke all on public.charge_reminders from public, anon, authenticated;
grant all on public.charge_reminders to service_role;

commit;
