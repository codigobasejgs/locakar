/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): NODE_PATH=<pglite> node scripts/sql/customer-bot.cjs */
// Autoatendimento: limite por hora (com aviso único), bloqueio do PIN, lead único aberto e permissões.
const { makeDb } = require('./saas-base.cjs');
const assert = require('assert/strict');

(async () => {
  const db = await makeDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const [{ id: a }] = await q(`insert into organizations(slug,name) values ('loca-a','Locadora A') returning id`);
  const [{ id: b }] = await q(`insert into organizations(slug,name) values ('loca-b','Locadora B') returning id`);
  await db.exec(`insert into clients(id,organization_id,code,name,phone,cpf) values ('c1','${a}',1,'Maria','11999999999','52998224725');`);

  // ---------- Limite por hora ----------
  const take = async (org, phone, limit) => (await q(`select public.customer_bot_take($1,$2,$3) r`, [org, phone, limit]))[0].r;
  assert.deepEqual([await take(a, '5511999999999', 2), await take(a, '5511999999999', 2)], ['ok', 'ok']);
  assert.equal(await take(a, '5511999999999', 2), 'warn', 'estourou: avisa uma vez');
  assert.equal(await take(a, '5511999999999', 2), 'blocked', 'depois do aviso: silêncio');
  assert.equal(await take(b, '5511999999999', 2), 'ok', 'limite é por locadora');
  await db.exec(`update customer_bot_rate set window_start = window_start - interval '1 hour' where organization_id='${a}'`);
  assert.equal(await take(a, '5511999999999', 2), 'ok', 'nova hora zera a contagem');

  // ---------- PIN ----------
  const pin = async (ok) => (await q(`select public.customer_bot_pin($1,'5511999999999',$2) r`, [a, ok]))[0].r;
  assert.equal(await pin(true), 'no_session');
  await db.exec(`insert into customer_bot_sessions(organization_id,phone,client_id) values ('${a}','5511999999999','c1')`);
  for (let i = 0; i < 4; i++) assert.equal(await pin(false), 'wrong');
  assert.equal(await pin(false), 'locked', '5º erro bloqueia');
  assert.equal(await pin(true), 'locked', 'bloqueado não aceita nem o PIN certo');
  await db.exec(`update customer_bot_sessions set pin_locked_until = now() - interval '1 minute' where organization_id='${a}'`);
  assert.equal(await pin(true), 'verified');
  const [s] = await q(`select verified_until > now() + interval '23 hours' v, pin_attempts from customer_bot_sessions where organization_id=$1`, [a]);
  assert.deepEqual([s.v, s.pin_attempts], [true, 0], 'verificação de 24h e contador zerado');

  // ---------- Lead aberto único ----------
  await q(`insert into customer_bot_leads(organization_id,phone,name) values ($1,'5511888888888','João')`, [a]);
  await assert.rejects(q(`insert into customer_bot_leads(organization_id,phone,name) values ($1,'5511888888888','João')`, [a]), /duplicate/);
  await q(`update customer_bot_leads set status='converted' where organization_id=$1`, [a]);
  await q(`insert into customer_bot_leads(organization_id,phone,name) values ($1,'5511888888888','João')`, [a]);
  await q(`insert into customer_bot_leads(organization_id,phone,name) values ($1,'5511888888888','João')`, [b]);

  // ---------- Novas colunas de copilot_config ----------
  await q(`insert into copilot_config(organization_id,instance_key) values ($1,$2)`, [a, `locakar_copilot_${a}`]);
  const [c] = await q(`select customer_bot_enabled, charge_buttons_enabled, customer_rate_per_hour from copilot_config where organization_id=$1`, [a]);
  assert.deepEqual(c, { customer_bot_enabled: false, charge_buttons_enabled: false, customer_rate_per_hour: 30 }, 'padrão desligado');
  await assert.rejects(q(`update copilot_config set customer_rate_per_hour = 1000 where organization_id=$1`, [a]), /check/);

  // ---------- Acesso direto negado ----------
  await db.exec(`set role authenticated`);
  for (const t of ['customer_bot_sessions', 'customer_bot_rate', 'customer_bot_leads']) await assert.rejects(db.query(`select * from ${t}`), /permission denied/);
  await assert.rejects(db.query(`select public.customer_bot_pin('${a}','x',true)`), /permission denied/);
  await db.exec(`reset role`);
  console.log('✓ customer-bot SQL ok');
})().catch((e) => { console.error(e); process.exit(1); });
