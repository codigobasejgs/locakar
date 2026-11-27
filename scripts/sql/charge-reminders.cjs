/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): NODE_PATH=<pglite> node scripts/sql/charge-reminders.cjs */
// Lembrete de cobrança: reserva atômica por parcela/dia/locadora; só o servidor enxerga.
const { makeDb } = require('./saas-base.cjs');
const assert = require('assert/strict');

(async () => {
  const db = await makeDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const [{ id: a }] = await q(`insert into organizations(slug,name) values ('loca-a','Locadora A') returning id`);
  const [{ id: b }] = await q(`insert into organizations(slug,name) values ('loca-b','Locadora B') returning id`);
  const claim = (org, day = '2026-11-27') => q(`insert into charge_reminders(organization_id,receipt_id,day) values ($1,'r1-r2',$2)`, [org, day]);

  await claim(a);
  await assert.rejects(claim(a), /duplicate/, 'segunda execução no mesmo dia barrada');
  await claim(a, '2026-11-28'); // dia seguinte: novo lembrete (atrasada é lembrada todo dia)
  await claim(b); // mesma parcela-id em outra locadora não colide

  // Concorrência real: duas reservas simultâneas, só uma vence.
  const race = await Promise.allSettled([claim(a, '2026-11-29'), claim(a, '2026-11-29')]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1, 'uma reserva vence a corrida');

  // Falha no envio libera a reserva.
  await q(`delete from charge_reminders where organization_id=$1 and receipt_id='r1-r2' and day='2026-11-29'`, [a]);
  await claim(a, '2026-11-29');

  await db.exec(`set role authenticated`);
  await assert.rejects(db.query(`select * from charge_reminders`), /permission denied/, 'navegador/app não lê');
  await db.exec(`reset role`);
  console.log('✓ charge-reminders SQL ok');
})().catch((e) => { console.error(e); process.exit(1); });
