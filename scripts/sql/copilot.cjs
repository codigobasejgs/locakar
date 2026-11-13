/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): npx -p @electric-sql/pglite node scripts/sql/copilot.cjs */
// Copiloto: clique duplo idempotente, expiração, cancelamento, baixa atômica e isolamento entre locadoras.
const { makeDb } = require('./saas-base.cjs');
const assert = require('assert/strict');

(async () => {
  const db = await makeDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const [{ id: a }] = await q(`insert into organizations(slug,name) values ('loca-a','Locadora A') returning id`);
  const [{ id: b }] = await q(`insert into organizations(slug,name) values ('loca-b','Locadora B') returning id`);
  await db.exec(`
    insert into vehicles(id,organization_id,name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('v1','${a}','Mobi','Fiat','Mobi',2024,'x','Hatch','Manual','Flex',5,'ABC1D23');
    insert into clients(id,organization_id,code,name,phone,cpf) values ('c1','${a}',1,'João','11999999999','52998224725');
    insert into rentals(id,organization_id,client_id,vehicle_id,contract_type,start_date,end_date,weekly_rate,receipts)
      values ('r1','${a}','c1','v1','Semanal','2026-11-01','2026-12-01',360,'[{"id":"r1-r1","dueDate":"2026-11-01","amount":360,"paid":false},{"id":"r1-r2","dueDate":"2026-11-08","amount":360,"paid":false,"cancelled":true}]');`);

  // ---------- Ações pendentes ----------
  const ins = (id, org, phone, extra = '') => q(`insert into copilot_pending_actions(id,organization_id,admin_phone,action_type,payload${extra ? ',expires_at' : ''}) values ($1,$2,$3,'create_expense','{"amount":10}'${extra ? `,${extra}` : ''})`, [id, org, phone]);
  const claim = async (org, id, phone, d) => (await q(`select public.claim_copilot_action($1,$2,$3,$4) r`, [org, id, phone, d]))[0].r;
  const id1 = '11111111-1111-4111-8111-111111111111';
  await ins(id1, a, '5511999999999');
  assert.equal((await claim(a, id1, '5511999999999', 'CONFIRMED')).result, 'claimed');
  const again = await claim(a, id1, '5511999999999', 'CONFIRMED');
  assert.deepEqual([again.result, again.status], ['already', 'CONFIRMED'], 'clique duplo não reexecuta');
  assert.equal((await claim(b, id1, '5511999999999', 'CONFIRMED')).result, 'not_found', 'outra locadora não enxerga a ação');
  assert.equal((await claim(a, id1, '5511888888888', 'CONFIRMED')).result, 'not_found', 'outro telefone não confirma');

  const id2 = '22222222-2222-4222-8222-222222222222';
  await ins(id2, a, '5511999999999');
  assert.equal((await claim(a, id2, '5511999999999', 'CANCELLED')).result, 'claimed');
  assert.equal((await claim(a, id2, '5511999999999', 'CONFIRMED')).status, 'CANCELLED', 'cancelada não confirma depois');

  const id3 = '33333333-3333-4333-8333-333333333333';
  await ins(id3, a, '5511999999999', `now() - interval '1 minute'`);
  assert.equal((await claim(a, id3, '5511999999999', 'CONFIRMED')).status, 'EXPIRED', 'expirada não executa');

  // ---------- Baixa atômica ----------
  const settle = async (org, rental, rec, amount = 360) => (await q(`select public.settle_rental_receipt($1,$2,$3,$4,'Pix','Copiloto WhatsApp','2026-11-13') r`, [org, rental, rec, amount]))[0].r;
  assert.equal(await settle(b, 'r1', 'r1-r1'), 'not_found', 'locadora B não baixa parcela de A');
  assert.equal(await settle(a, 'r1', 'r1-r1', 0), 'invalid');
  assert.equal(await settle(a, 'r1', 'r1-r1'), 'settled');
  assert.equal(await settle(a, 'r1', 'r1-r1'), 'already', 'segunda baixa não duplica');
  assert.equal(await settle(a, 'r1', 'r1-r2'), 'cancelled');
  const [{ receipts }] = await q(`select receipts from rentals where id='r1'`);
  assert.deepEqual([receipts[0].paid, receipts[0].amountPaid, receipts[0].paidAt, receipts[0].settledBy], [true, 360, '2026-11-13', 'Copiloto WhatsApp']);
  assert.equal(receipts.length, 2, 'demais parcelas preservadas');

  // ---------- Acesso direto negado ----------
  await db.exec(`set role authenticated`);
  await assert.rejects(db.query(`select * from copilot_pending_actions`), /permission denied/);
  await assert.rejects(db.query(`select public.claim_copilot_action('${a}','${id1}','x','CONFIRMED')`), /permission denied/);
  await db.exec(`reset role`);
  console.log('✓ copilot SQL ok');
})().catch((e) => { console.error(e); process.exit(1); });
