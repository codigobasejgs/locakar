-- Diagnóstico multiempresa — rodar no Supabase → SQL Editor (somente leitura, exceto o bloco 4 comentado).

-- 1) Locadoras e quem é membro de cada uma (o mesmo e-mail em duas = troca de locadora pelo seletor no topo do painel)
select o.name as locadora, o.slug, u.email, m.role,
       (p.active_organization_id = o.id) as locadora_ativa_do_usuario
  from memberships m
  join organizations o on o.id = m.organization_id
  join auth.users u on u.id = m.user_id
  left join user_preferences p on p.user_id = m.user_id
 order by u.email, o.name;

-- 2) Veículos por locadora
select o.name as locadora, v.plate, v.name, v.created_at
  from vehicles v join organizations o on o.id = v.organization_id
 order by v.created_at desc limit 50;

-- 3) Notificações por locadora (últimas)
select o.name as locadora, n.title, n.created_at
  from notifications n join organizations o on o.id = n.organization_id
 order by n.created_at desc limit 30;

-- 4) Mover UM veículo cadastrado na locadora errada (troque a placa e o slug de destino).
--    O banco não permite mudar a locadora de um registro pelo app; por aqui, com triggers desligados só nesta transação.
-- begin;
--   alter table public.vehicles disable trigger user;
--   update public.vehicles set organization_id = (select id from organizations where slug = 'locakar')
--    where plate = 'ABC1D23' and not exists (select 1 from rentals r where r.vehicle_id = vehicles.id);
--   alter table public.vehicles enable trigger user;
-- commit;
