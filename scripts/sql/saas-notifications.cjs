/* eslint-disable @typescript-eslint/no-require-imports -- teste SQL offline (PGlite) */
const { makeDb, as } = require('./saas-base.cjs');
const assert = require('assert/strict');
(async () => {
  const db = await makeDb();
  const u = async (e) => (await db.query(`insert into auth.users(email,email_confirmed_at) values ($1,now()) returning id`, [e])).rows[0].id;
  const loca = (await db.query(`select default_organization_id id from platform_config`)).rows[0].id;
  const dono = await u('dono@locakar'); await db.query(`insert into memberships values ($1,$2,'owner')`, [loca, dono]);
  const donoB = await u('dono@b'); const orgB = (await db.query(`select create_organization($1,'Locadora B','loc-b') id`, [donoB])).rows[0].id;
  await db.query(`insert into notifications(type,category,title,body,dedupe_key,organization_id) values ('x','system','Aviso LOCAKAR','a','k1',$1),('x','system','Aviso B','b','k2',$2)`, [loca, orgB]);
  const seen = async (uid) => (await as(db, uid, () => db.query(`select title from notifications order by title`))).rows.map(r => r.title);
  assert.deepEqual(await seen(dono), ['Aviso LOCAKAR']);
  assert.deepEqual(await seen(donoB), ['Aviso B']);
  // Dono da LOCAKAR também membro da B: vê só a locadora ativa
  await db.query(`insert into memberships values ($1,$2,'admin')`, [orgB, dono]);
  assert.deepEqual(await seen(dono), ['Aviso LOCAKAR'], 'ativa = primeira');
  await as(db, dono, () => db.query(`select set_active_organization($1)`, [orgB]));
  assert.deepEqual(await seen(dono), ['Aviso B'], 'trocou para B');
  console.log('OK notificações isoladas por locadora (incl. membro de duas)');
  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
