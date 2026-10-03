/* eslint-disable @typescript-eslint/no-require-imports -- teste SQL offline (PGlite) */
const { makeDb, as } = require('./saas-base.cjs');
const assert = require('assert/strict');
(async () => {
  const db = await makeDb();
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const loca = (await one(`select default_organization_id id from platform_config`)).id;
  const adm = (await one(`insert into auth.users(email,email_confirmed_at) values ('adm@locakar',now()) returning id`)).id;
  await db.query(`insert into memberships values ($1,$2,'owner')`, [loca, adm]);
  await db.query(`insert into platform_admins(user_id) values ($1)`, [adm]);
  const dono = (await one(`insert into auth.users(email,email_confirmed_at) values ('dono@b',now()) returning id`)).id;
  const b = (await one(`select create_organization($1,'Locadora B','locadora-b') id`, [dono])).id;
  // Locadora B com dados completos, incluindo contrato ASSINADO (guard impede excluir pelo app)
  await as(db, dono, () => db.exec(`
    insert into vehicles(id,name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('vb','Mobi','Fiat','Mobi',2024,'x','Hatch','Manual','Flex',5,'BBB1B11');
    insert into clients(id,name,phone,cpf) values ('cb','Cliente B','1','52998224725');
    insert into rentals(id,client_id,vehicle_id,contract_type,start_date,end_date,weekly_rate,status) values ('rb','cb','vb','Semanal','2026-10-01','2026-10-08',500,'active');
    insert into maintenance(date,vehicle_id,description) values ('2026-10-02','vb','Óleo');
    insert into contracts(id,rental_id,content,client_name,client_cpf,token) values ('kb','rb','C','Cliente B','52998224725', repeat('c',48));`));
  await db.exec(`update contracts set status='signed', signed_at=now() where id='kb'`);
  await db.query(`insert into notifications(type,category,title,body,dedupe_key,organization_id) values ('vehicle','vehicles','x','x','kb',$1)`, [b]);

  // Visão geral: todas as locadoras, com contadores
  const ov = (await one(`select platform_overview() o`)).o;
  assert.equal(ov.length, 2, 'lista as 2 locadoras');
  const rb = ov.find((o) => o.id === b);
  assert.equal(rb.vehicles, 1); assert.equal(rb.clients, 1); assert.equal(rb.active_rentals, 1); assert.equal(rb.owner_email, 'dono@b');
  assert.equal(ov.find((o) => o.id === loca).is_default, true);
  assert.equal((await db.query(`select * from platform_org_members($1)`, [b])).rows[0].email, 'dono@b');
  assert.equal((await one(`select platform_user_id(' DONO@B ') id`)).id, dono, 'busca e-mail sem diferenciar maiúsculas');
  assert.equal((await db.query(`select * from platform_admin_list()`)).rows.length, 1);

  // Usuário comum não executa as funções do Super Admin
  await assert.rejects(as(db, dono, () => db.query(`select platform_overview()`)), /permission denied/);
  await assert.rejects(as(db, adm, () => db.query(`select platform_delete_organization($1)`, [b])), /permission denied/, 'nem o admin pela sessão: só pelo servidor');
  await assert.rejects(as(db, dono, () => db.query(`select * from platform_audit`)), /permission denied/);

  // Principal protegida
  await assert.rejects(db.query(`select platform_delete_organization($1)`, [loca]), /principal/);

  // Exclusão apaga tudo da B e nada da LOCAKAR
  await as(db, adm, () => db.exec(`insert into vehicles(name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('Kwid','Renault','Kwid',2024,'x','Hatch','Manual','Flex',5,'AAA1A11')`));
  const removed = (await one(`select platform_delete_organization($1) r`, [b])).r;
  assert.equal(removed.contracts, 1); assert.equal(removed.vehicles, 1);
  assert.equal((await one(`select count(*)::int n from organizations where id=$1`, [b])).n, 0);
  for (const t of ['vehicles', 'clients', 'rentals', 'contracts', 'maintenance', 'notifications', 'settings']) {
    assert.equal((await one(`select count(*)::int n from ${t} where organization_id=$1`, [b])).n, 0, `${t} da B apagado`);
  }
  assert.equal((await one(`select count(*)::int n from memberships where organization_id=$1`, [b])).n, 0);
  assert.equal((await one(`select count(*)::int n from vehicles where organization_id=$1`, [loca])).n, 1, 'LOCAKAR intacta');
  assert.equal((await one(`select count(*)::int n from pg_trigger where tgrelid in ('public.contracts'::regclass, 'public.vehicles'::regclass) and not tgisinternal and tgenabled <> 'O'`)).n, 0, 'triggers religados');
  // o dono da B pode criar de novo com o mesmo endereço
  await db.query(`update organizations set created_by=null where created_by=$1`, [dono]);
  await db.query(`select create_organization($1,'Locadora B','locadora-b')`, [dono]);
  console.log('OK super admin: visão geral, equipe, permissões, exclusão completa e isolada');
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
