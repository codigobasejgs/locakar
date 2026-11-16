/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): NODE_PATH=<pglite> node scripts/sql/payment-gateways.cjs */
// Gateways de link: novos providers/método aceitos, uma parcela quitada uma vez só, credenciais só no servidor.
const { makeDb } = require('./saas-base.cjs');
const assert = require('assert/strict');

(async () => {
  const db = await makeDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const [{ id: a }] = await q(`insert into organizations(slug,name) values ('loca-a','Locadora A') returning id`);
  const [{ id: b }] = await q(`insert into organizations(slug,name) values ('loca-b','Locadora B') returning id`);
  await db.exec(`
    insert into vehicles(id,organization_id,name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('v1','${a}','Mobi','Fiat','Mobi',2024,'x','Hatch','Manual','Flex',5,'ABC1D23');
    insert into clients(id,organization_id,code,name,phone,cpf) values ('c1','${a}',1,'Maria','11999999999','52998224725');
    insert into rentals(id,organization_id,client_id,vehicle_id,contract_type,start_date,end_date,weekly_rate,receipts)
      values ('r1','${a}','c1','v1','Semanal','2026-11-01','2026-12-01',360,'[{"id":"r1-r2","dueDate":"2026-11-08","amount":378.5,"paid":false}]');`);

  const tx = async (provider, status = 'link_created', method = null) =>
    (await q(`insert into payment_transactions(organization_id,provider,flow,rental_id,receipt_id,client_id,amount_cents,status,method) values ($1,$2,'checkout','r1','r1-r2','c1',37850,$3,$4) returning id`, [a, provider, status, method]))[0].id;

  // ---------- Providers e método novos ----------
  for (const p of ['mercadopago', 'pagbank', 'pagarme', 'infinitepay', 'asaas']) await tx(p);
  await assert.rejects(tx('ton'), /check/, 'provider desconhecido recusado');
  await tx('pagarme', 'link_created', 'boleto');
  await assert.rejects(tx('pagarme', 'link_created', 'dinheiro'), /check/);

  // ---------- Uma parcela quitada uma vez só (entre gateways diferentes) ----------
  const [first] = await q(`select id from payment_transactions where provider='mercadopago'`);
  await q(`update payment_transactions set status='paid' where id=$1`, [first.id]);
  const [second] = await q(`select id from payment_transactions where provider='pagbank'`);
  await assert.rejects(q(`update payment_transactions set status='paid' where id=$1`, [second.id]), /duplicate/, 'pagamento duplo da mesma parcela barrado');

  // ---------- Configuração por locadora, só servidor ----------
  await q(`insert into payment_gateways(organization_id,provider,credential_enc,credential_last4) values ($1,'mercadopago','v1:x:y:z','1234')`, [a]);
  await q(`insert into payment_gateways(organization_id,provider) values ($1,'mercadopago')`, [b]);
  await assert.rejects(q(`insert into payment_gateways(organization_id,provider) values ($1,'mercadopago')`, [a]), /duplicate/, 'um registro por gateway e locadora');
  await assert.rejects(q(`insert into payment_gateways(organization_id,provider) values ($1,'stone')`, [a]), /check/);
  const [d] = await q(`select enabled, environment from payment_gateways where organization_id=$1`, [a]);
  assert.deepEqual(d, { enabled: false, environment: 'sandbox' }, 'padrão: desligado e em testes');

  await db.exec(`set role authenticated`);
  await assert.rejects(db.query(`select * from payment_gateways`), /permission denied/, 'credenciais nunca legíveis pelo navegador/app');
  await db.exec(`reset role`);
  console.log('✓ payment-gateways SQL ok');
})().catch((e) => { console.error(e); process.exit(1); });
