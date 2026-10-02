-- Correção: dados da LOCAKAR que caíram na locadora "Código Base" (ex-Rota Sul).
-- Rode UMA PARTE POR VEZ no Supabase → SQL Editor (o editor mostra só o resultado do último comando).

-- ==== PARTE 1 — DIAGNÓSTICO (só leitura): quem é membro de cada locadora e quem a criou
select o.name as locadora, o.slug, u.email, m.role, (o.created_by = u.id) as criou_a_locadora
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  join auth.users u on u.id = m.user_id
 order by o.name, u.email;

-- ==== PARTE 2 — CORREÇÃO: tudo que está na Código Base volta para a LOCAKAR
-- e quem é da LOCAKAR deixa de ser membro da Código Base (volta a abrir o painel na LOCAKAR).
-- Transação única: se algo falhar, nada muda.
begin;
do $$
declare
  v_loca uuid;
  v_cb   uuid;
  t      text;
  n      int;
begin
  select id into v_loca from public.organizations where slug = 'locakar';
  if (select count(*) from public.organizations where name ilike 'c_digo base') <> 1 then
    raise exception 'Esperava 1 locadora chamada "Código Base". Encontradas: %',
      (select string_agg(name || ' (' || slug || ')', ', ') from public.organizations);
  end if;
  select id into v_cb from public.organizations where name ilike 'c_digo base';

  -- Duplicados: o mesmo veículo/cliente cadastrado de novo na LOCAKAR depois de cair na Código Base.
  -- Fica o da LOCAKAR; o que for vinculado à cópia (locações, manutenções, multas...) passa para ele
  -- e a cópia é apagada.
  create temp table dup_vehicles on commit drop as
    select cb.id as old_id, l.id as new_id, cb.plate
      from public.vehicles cb
      join lateral (
        select v.id from public.vehicles v
         where v.organization_id = v_loca
           and (v.plate = cb.plate
                or (nullif(trim(cb.chassis), '') is not null and upper(trim(v.chassis)) = upper(trim(cb.chassis)))
                or (cb.selsyn_rastreavel_id is not null and v.selsyn_rastreavel_id = cb.selsyn_rastreavel_id))
         order by (v.plate = cb.plate) desc limit 1) l on true
     where cb.organization_id = v_cb;
  create temp table dup_clients on commit drop as
    select cb.id as old_id, l.id as new_id
      from public.clients cb
      join lateral (
        select c.id from public.clients c
         where c.organization_id = v_loca
           and (regexp_replace(c.cpf, '\D', '', 'g') = regexp_replace(cb.cpf, '\D', '', 'g')
                or (cb.user_id is not null and c.user_id = cb.user_id))
         limit 1) l on true
     where cb.organization_id = v_cb;

  -- Histórico FIPE do mesmo mês já existe no veículo da LOCAKAR: descarta o da cópia (é só a cotação repetida).
  delete from public.vehicle_fipe_history h using dup_vehicles d
   where h.vehicle_id = d.old_id and exists (select 1 from public.vehicle_fipe_history k
     where k.vehicle_id = d.new_id and k.fipe_code = h.fipe_code and k.year_id = h.year_id and k.reference_month = h.reference_month);
  foreach t in array array['rentals','reservations','expenses','maintenance','fines','vehicle_incidents','tenant_inspections','rental_requests','vehicle_fipe_history'] loop
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I x set vehicle_id = d.new_id from dup_vehicles d where x.vehicle_id = d.old_id', t);
    get diagnostics n = row_count;
    execute format('alter table public.%I enable trigger user', t);
    if n > 0 then raise notice '% vínculo(s) de % passados para o veículo da LOCAKAR', n, t; end if;
  end loop;
  -- Vínculos únicos por cliente: descarta o da cópia quando o da LOCAKAR já existe.
  delete from public.asaas_customers a using dup_clients d
   where a.client_id = d.old_id and exists (select 1 from public.asaas_customers b where b.client_id = d.new_id and b.environment = a.environment);
  delete from public.tenant_devices a using dup_clients d
   where a.client_id = d.old_id and exists (select 1 from public.tenant_devices b where b.client_id = d.new_id and b.installation_id = a.installation_id);
  delete from public.tenant_inspections a using dup_clients d
   where a.client_id = d.old_id and a.request_id is not null
     and exists (select 1 from public.tenant_inspections b where b.client_id = d.new_id and b.request_id = a.request_id);
  foreach t in array array['rentals','reservations','fines','notes','payment_receipts','vehicle_incidents','tenant_devices','antifraud_telemetry',
                           'tenant_consents','tenant_inspections','tenant_documents','rental_requests','payment_transactions','asaas_customers','client_push_subscriptions'] loop
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I x set client_id = d.new_id from dup_clients d where x.client_id = d.old_id', t);
    get diagnostics n = row_count;
    execute format('alter table public.%I enable trigger user', t);
    if n > 0 then raise notice '% vínculo(s) de % passados para o cliente da LOCAKAR', n, t; end if;
  end loop;
  alter table public.vehicles disable trigger user;
  delete from public.vehicles v using dup_vehicles d where v.id = d.old_id;
  get diagnostics n = row_count;
  alter table public.vehicles enable trigger user;
  if n > 0 then raise notice '% veículo(s) duplicado(s) apagados da Código Base (já existem na LOCAKAR): %', n, (select string_agg(plate, ', ') from dup_vehicles); end if;
  alter table public.clients disable trigger user;
  delete from public.clients c using dup_clients d where c.id = d.old_id;
  get diagnostics n = row_count;
  alter table public.clients enable trigger user;
  if n > 0 then raise notice '% cliente(s) duplicado(s) apagados da Código Base (já existem na LOCAKAR)', n; end if;

  -- Código do cliente é único por locadora: renumera os que vierem, depois dos da LOCAKAR.
  alter table public.clients disable trigger user;
  update public.clients set code = code + coalesce((select max(code) from public.clients where organization_id = v_loca), 0)
   where organization_id = v_cb;
  alter table public.clients enable trigger user;

  foreach t in array array[
    'vehicles','vehicle_fipe_history','clients','rentals','reservations','expenses','maintenance','fines','notes',
    'contracts','email_log','contract_templates','contract_template_versions',
    'payment_receipts','vehicle_incidents','tenant_devices','antifraud_telemetry','tenant_consents',
    'tenant_inspections','tenant_documents','rental_requests',
    'payment_transactions','asaas_customers','asaas_webhook_events',
    'notifications','client_push_subscriptions','audit_log','selsyn_requests'] loop
    -- Triggers desligados só nesta tabela e só neste comando (o banco não deixa trocar a locadora pelo app).
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set organization_id = $1 where organization_id = $2', t) using v_loca, v_cb;
    get diagnostics n = row_count;
    execute format('alter table public.%I enable trigger user', t);
    if n > 0 then raise notice '% registro(s) movidos em %', n, t; end if;
  end loop;

  -- Membros da LOCAKAR saem da Código Base e voltam a abrir o painel na LOCAKAR.
  update public.user_preferences set active_organization_id = v_loca, updated_at = now()
   where active_organization_id = v_cb
     and user_id in (select user_id from public.memberships where organization_id = v_loca);
  update public.organizations set created_by = null
   where id = v_cb and created_by in (select user_id from public.memberships where organization_id = v_loca);
  delete from public.memberships
   where organization_id = v_cb
     and user_id in (select user_id from public.memberships where organization_id = v_loca);
end $$;
commit;

-- Conferência: veículos e membros por locadora
select o.name as locadora,
       (select count(*) from public.vehicles v where v.organization_id = o.id) as veiculos,
       (select count(*) from public.clients c where c.organization_id = o.id) as clientes,
       coalesce((select string_agg(u.email || ' (' || m.role || ')', ', ')
                   from public.memberships m join auth.users u on u.id = m.user_id
                  where m.organization_id = o.id), '— sem membros —') as membros
  from public.organizations o order by o.created_at;

-- ==== PARTE 3 — OPCIONAL: apagar a Código Base (só se ficou "— sem membros —" e vazia),
-- para criá-la de novo pelo cadastro com o login próprio dela.
begin;
do $$
declare
  v_cb uuid;
  t    text;
begin
  select id into v_cb from public.organizations where name ilike 'c_digo base';
  if v_cb is null then raise exception 'Locadora "Código Base" não encontrada.'; end if;
  if exists (select 1 from public.memberships where organization_id = v_cb) then
    raise exception 'A Código Base tem membros. Não apaguei.';
  end if;
  if exists (select 1 from public.vehicles where organization_id = v_cb)
     or exists (select 1 from public.clients where organization_id = v_cb)
     or exists (select 1 from public.rentals where organization_id = v_cb) then
    raise exception 'A Código Base tem dados. Rode a PARTE 2 antes.';
  end if;
  foreach t in array array['settings','asaas_config','contract_ai_config','notifications','audit_log','email_log','selsyn_requests'] loop
    execute format('alter table public.%I disable trigger user', t);
    execute format('delete from public.%I where organization_id = $1', t) using v_cb;
    execute format('alter table public.%I enable trigger user', t);
  end loop;
  delete from public.organizations where id = v_cb; -- assinatura, convites: apagados juntos
end $$;
commit;
