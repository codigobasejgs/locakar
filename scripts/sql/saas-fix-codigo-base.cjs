/* eslint-disable @typescript-eslint/no-require-imports -- teste SQL offline (PGlite) */
const { makeDb, as } = require('./saas-base.cjs');
const fs = require('fs'); const assert = require('assert/strict');
const sql = fs.readFileSync(require('path').resolve(__dirname, '../../docs/saas/corrigir-codigo-base.sql'), 'utf8');
const part = (n) => sql.split(/^-- ==== PARTE /m).find((s) => s.startsWith(String(n))).replace(/^.*\n/, '');
(async () => {
  const db = await makeDb();
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const loca = (await one(`select default_organization_id id from platform_config`)).id;
  const dono = (await one(`insert into auth.users(email,email_confirmed_at) values ('dono@locakar',now()) returning id`)).id;
  await db.query(`insert into memberships values ($1,$2,'owner')`, [loca, dono]);
  await as(db, dono, () => db.exec(`insert into vehicles(name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('Mobi','Fiat','Mobi',2024,'x','Hatch','Manual','Flex',5,'AAA1A11')`));
  // O bug: cadastro com a sessão da LOCAKAR aberta cria a "Rota Sul" para o mesmo login
  const cb = (await one(`select create_organization($1,'Rota Sul Locadora','rota-sul') id`, [dono])).id;
  await db.query(`update organizations set name='Código Base' where id=$1`, [cb]);
  await as(db, dono, () => db.exec(`insert into vehicles(name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('Onix','GM','Onix',2024,'x','Hatch','Manual','Flex',5,'BBB2B22')`));
  await db.query(`insert into notifications(type,category,title,body,dedupe_key,organization_id) values ('vehicle','vehicles','Novo veículo na frota','x','kcb',$1)`, [cb]);
  // Seu cenário: mesmo veículo cadastrado de novo na LOCAKAR (placa GBD3D08 nas duas) + manutenção ligada à cópia
  await as(db, dono, () => db.exec(`insert into vehicles(name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('Kwid','Renault','Kwid',2024,'x','Hatch','Manual','Flex',5,'GBD3D08')`));
  const copia = (await one(`select id from vehicles where plate='GBD3D08' and organization_id=$1`, [cb])).id;
  await as(db, dono, () => db.exec(`insert into maintenance(date,vehicle_id,description) values ('2026-10-02','${copia}','Troca de óleo')`));
  await db.query(`update user_preferences set active_organization_id=$1 where user_id=$2`, [loca, dono]);
  await as(db, dono, () => db.exec(`insert into vehicles(name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('Kwid','Renault','Kwid',2024,'x','Hatch','Manual','Flex',5,'GBD3D08')`));
  const original = (await one(`select id from vehicles where plate='GBD3D08' and organization_id=$1`, [loca])).id;
  for (const v of [copia, original]) await db.query(`insert into vehicle_fipe_history(vehicle_id,fipe_code,year_id,price,reference_month,reference_label) values ($1,'025266-2','2020-5',50000,'2026-10','outubro/2026')`, [v]);
  await db.query(`insert into vehicle_fipe_history(vehicle_id,fipe_code,year_id,price,reference_month,reference_label) values ($1,'025266-2','2020-5',49000,'2026-09','setembro/2026')`, [copia]);
  await db.query(`update user_preferences set active_organization_id=$1 where user_id=$2`, [cb, dono]);
  assert.equal((await one(`select organization_id o from vehicles where plate='BBB2B22'`)).o, cb, 'reproduz: veículo caiu na Código Base');

  const diag = (await db.query(part(1))).rows;
  assert.ok(diag.some((r) => r.locadora === 'Código Base' && r.email === 'dono@locakar' && r.criou_a_locadora), 'diagnóstico mostra o mesmo login dono das duas');

  await db.exec(part(2).split('-- Conferência')[0]);
  assert.equal((await one(`select organization_id o from vehicles where plate='BBB2B22'`)).o, loca, 'veículo voltou para a LOCAKAR');
  assert.equal((await one(`select count(*)::int n from notifications where organization_id=$1`, [cb])).n, 0);
  assert.equal((await one(`select count(*)::int n from vehicles where plate='GBD3D08'`)).n, 1, "duplicado: fica só o da LOCAKAR");
  const kwid = (await one(`select id, organization_id o from vehicles where plate='GBD3D08'`));
  assert.equal(kwid.o, loca);
  assert.equal((await one(`select vehicle_id v, organization_id o from maintenance where description='Troca de óleo'`)).v, kwid.id, "manutenção passou para o veículo da LOCAKAR");
  assert.deepEqual((await db.query(`select reference_month m from vehicle_fipe_history where vehicle_id=$1 order by 1`, [kwid.id])).rows.map((r) => r.m), ["2026-09", "2026-10"], "FIPE: mês repetido descartado, mês novo preservado");
  assert.equal((await one(`select count(*)::int n from memberships where organization_id=$1`, [cb])).n, 0, 'dono saiu da Código Base');
  assert.equal((await one(`select active_organization_id a from user_preferences where user_id=$1`, [dono])).a, loca);
  await as(db, dono, async () => assert.equal((await one(`select count(*)::int n from vehicles`)).n, 3, 'LOCAKAR vê os 3'));
  const conf = (await db.query(part(2).split('-- Conferência')[1].replace(/^.*\n/, ''))).rows;
  assert.ok(conf.find((r) => r.locadora === 'Código Base').membros.includes('sem membros'));
  // guard do contrato e regra de locadora religados
  await assert.rejects(as(db, dono, () => db.query(`update vehicles set organization_id=$1 where plate='AAA1A11'`, [cb])), /alterada|row-level/);

  await db.exec(part(3));
  assert.equal((await one(`select count(*)::int n from organizations where id=$1`, [cb])).n, 0, 'Código Base apagada');
  // pode recriar com o mesmo endereço por outro login
  const outro = (await one(`insert into auth.users(email,email_confirmed_at) values ('dono@codigobase',now()) returning id`)).id;
  await db.query(`select create_organization($1,'Código Base','rota-sul')`, [outro]);

  // Cenário alternativo: Código Base de outro dono real → membro dele permanece
  const db2 = await makeDb();
  const l2 = (await db2.query(`select default_organization_id id from platform_config`)).rows[0].id;
  const d2 = (await db2.query(`insert into auth.users(email,email_confirmed_at) values ('a@a',now()) returning id`)).rows[0].id;
  await db2.query(`insert into memberships values ($1,$2,'owner')`, [l2, d2]);
  const real = (await db2.query(`insert into auth.users(email,email_confirmed_at) values ('b@b',now()) returning id`)).rows[0].id;
  const cb2 = (await db2.query(`select create_organization($1,'Código Base','codigo-base') id`, [real])).rows[0].id;
  await db2.exec(part(2).split('-- Conferência')[0]);
  assert.equal((await db2.query(`select count(*)::int n from memberships where organization_id=$1 and user_id=$2`, [cb2, real])).rows[0].n, 1, 'dono real mantido');
  await assert.rejects(db2.exec(part(3)), /tem membros/);

  console.log('OK correção Código Base: reproduz, diagnóstico, move, membros, conferência, apagar e recriar, dono real preservado');
  await db.close(); await db2.close();
})().catch((e) => { console.error(e); process.exit(1); });
