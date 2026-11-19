-- Planos comerciais da Frota Easy: preço de tabela + promocional (ancoragem) e recursos por plano (feature flags).
-- Estende public.plans / public.subscriptions existentes. Idempotente. Leitura: autenticados (RLS já existente);
-- escrita: só service_role (Super Admin pela API).
begin;

alter table public.plans
  add column if not exists price_cents       int check (price_cents is null or price_cents between 0 and 10000000),
  add column if not exists promo_price_cents int check (promo_price_cents is null or promo_price_cents between 0 and 10000000),
  add column if not exists promo_active      boolean not null default false,
  add column if not exists promo_label       text check (promo_label is null or length(promo_label) <= 60),
  add column if not exists highlight         boolean not null default false,
  add column if not exists sort              int not null default 0,
  add column if not exists updated_at        timestamptz not null default now();

-- Módulos atuais (todos liberados) + recursos por plano em entitlements.features.
insert into public.plans (id, name, price_cents, promo_price_cents, promo_active, promo_label, highlight, sort, entitlements) values
  ('essencial', 'Essencial', 7990, 7990, false, null, false, 1,
   '{"modules":{"reservations":true,"finance":true,"maintenance":true,"fines":true,"contracts":true,"inspections":true,"tracking":false,"fipe":true,"payments":true,"reports":true,"tenant_app":true},"maxVehicles":null,"maxUsers":null,"maxContractTemplates":5,
     "features":{"whatsapp_buttons":false,"smart_contracts":false,"periodic_checkin":false,"ai_copilot":false,"tracking_selsyn":false,"advanced_reports":false}}'::jsonb),
  ('profissional', 'Profissional', 9990, 7990, true, 'Por tempo limitado', false, 2,
   '{"modules":{"reservations":true,"finance":true,"maintenance":true,"fines":true,"contracts":true,"inspections":true,"tracking":false,"fipe":true,"payments":true,"reports":true,"tenant_app":true},"maxVehicles":null,"maxUsers":null,"maxContractTemplates":5,
     "features":{"whatsapp_buttons":true,"smart_contracts":true,"periodic_checkin":true,"ai_copilot":false,"tracking_selsyn":false,"advanced_reports":false}}'::jsonb)
on conflict (id) do nothing;

-- "completo" já existe (LOCAKAR e demais): só ganha preço e recursos; módulos e limites ficam como estão.
update public.plans set
  price_cents = coalesce(price_cents, 10990),
  promo_price_cents = coalesce(promo_price_cents, 7990),
  promo_active = case when price_cents is null then true else promo_active end,
  promo_label = coalesce(promo_label, 'Oferta de lançamento • Por tempo limitado'),
  highlight = true, sort = 3,
  entitlements = entitlements || jsonb_build_object('features', coalesce(entitlements -> 'features', '{}'::jsonb) ||
    '{"whatsapp_buttons":true,"smart_contracts":true,"periodic_checkin":true,"ai_copilot":true,"tracking_selsyn":true,"advanced_reports":true}'::jsonb)
where id = 'completo';

-- Teste grátis: tudo liberado (como diz a landing), exceto rastreamento (já era assim). Sem preço = fora da vitrine.
update public.plans set sort = 0,
  entitlements = entitlements || jsonb_build_object('features', coalesce(entitlements -> 'features', '{}'::jsonb) ||
    '{"whatsapp_buttons":true,"smart_contracts":true,"periodic_checkin":true,"ai_copilot":true,"tracking_selsyn":false,"advanced_reports":true}'::jsonb)
where id = 'trial';

-- A locadora principal (LOCAKAR) fica no Completo: nenhum recurso em produção é perdido.
insert into public.subscriptions (organization_id, plan_id)
select default_organization_id, 'completo' from public.platform_config where id = 1 and default_organization_id is not null
on conflict (organization_id) do update set plan_id = 'completo', updated_at = now();

drop trigger if exists set_updated_at on public.plans;
create trigger set_updated_at before update on public.plans for each row execute function public.set_updated_at();

commit;
