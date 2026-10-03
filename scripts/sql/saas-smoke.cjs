/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): npx -p @electric-sql/pglite node scripts/sql/saas-tenancy.cjs */
const { makeDb, as } = require('./saas-base.cjs');
const assert = require('assert/strict');
(async () => {
  const db = await makeDb({ upTo: '20261012100000_fix_client_link_takeover.sql' });
  // Fase 0: sequestro por CPF bloqueado
  await db.exec(`insert into clients(id, code, name, phone, cpf, email) values ('c1', 1, 'Vítima', '1', '52998224725', 'vitima@x.com')`);
  const atk = (await db.query(`insert into auth.users(email, email_confirmed_at, raw_user_meta_data) values ('atk@x.com', now(), '{"cpf":"52998224725"}') returning id`)).rows[0].id;
  const r1 = await as(db, atk, () => db.query(`select public.ensure_client_for_current_user() id`));
  assert.equal(r1.rows[0].id, null, 'atacante não pode vincular');
  const unconf = (await db.query(`insert into auth.users(email, raw_user_meta_data) values ('vitima@x.com', '{"cpf":"52998224725"}') returning id`)).rows[0].id;
  assert.equal((await as(db, unconf, () => db.query(`select public.ensure_client_for_current_user() id`))).rows[0].id, null, 'sem e-mail confirmado');
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [unconf]);
  assert.equal((await as(db, unconf, () => db.query(`select public.ensure_client_for_current_user() id`))).rows[0].id, 'c1', 'dono legítimo vincula');
  const novo = (await db.query(`insert into auth.users(email, email_confirmed_at, raw_user_meta_data) values ('novo@x.com', now(), '{"cpf":"11144477735","name":"Novo"}') returning id`)).rows[0].id;
  const nid = (await as(db, novo, () => db.query(`select public.ensure_client_for_current_user() id`))).rows[0].id;
  assert.ok(nid && nid !== 'c1', 'novo cliente criado');
  console.log('OK fase 0');
  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
