-- Estimativa de KM: preserva diário/mensal históricos, adiciona semanal e período selecionado.
begin;
alter table public.clients add column if not exists km_weekly integer check (km_weekly is null or km_weekly >= 0);
alter table public.clients add column if not exists km_period text check (km_period is null or km_period in ('daily','weekly','monthly'));
update public.clients set km_period = case when km_daily is not null then 'daily' when km_monthly is not null then 'monthly' else 'daily' end where km_period is null;
alter table public.clients alter column km_period set default 'daily';
-- Campos novos herdam RLS por organização da tabela existente. Não remove nem converte valores antigos.
commit;
