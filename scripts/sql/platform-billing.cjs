/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): NODE_PATH=<pglite> node scripts/sql/platform-billing.cjs */
// Assinatura Frota Easy: baixa atômica da fatura, +30 dias somando, reativa a locadora; vencimento suspende; LOCAKAR nunca.
const { makeDb } = require('./saas-base.cjs');
const assert = require('assert/strict');

(async () => {
  const db = await makeDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const [{ id: a }] = await q(`insert into organizations(slug,name,status) values ('loca-a','Locadora A','past_due') returning id`);
  await q(`insert into subscriptions(organization_id, plan_id, trial_ends_at) values ($1, 'trial', now() - interval '3 days')`, [a]);

  const inv = async (plan = 'completo') => (await q(`insert into platform_invoices(organization_id, plan_id, amount_cents, provider) values ($1, $2, 7990, 'infinitepay') returning id`, [a, plan]))[0].id;

  // 1ª fatura: ativa, troca o plano e libera 30 dias a partir de agora.
  const i1 = await inv();
  const [{ end: e1 }] = await q(`select platform_invoice_paid($1) "end"`, [i1]);
  assert.ok(e1, 'primeira confirmação baixa');
  const [s1] = await q(`select s.plan_id, s.current_period_end, o.status from subscriptions s join organizations o on o.id = s.organization_id where o.id = $1`, [a]);
  assert.equal(s1.plan_id, 'completo');
  assert.equal(s1.status, 'active', 'pagamento reativa a locadora');
  const days = (new Date(s1.current_period_end) - Date.now()) / 86_400_000;
  assert.ok(days > 29.9 && days < 30.1, '30 dias');

  // Webhook repetido: não soma de novo.
  const [{ end: again }] = await q(`select platform_invoice_paid($1) "end"`, [i1]);
  assert.equal(again, null, 'baixa idempotente');

  // Pagar antes de vencer soma ao período restante.
  const i2 = await inv('profissional');
  await q(`select platform_invoice_paid($1)`, [i2]);
  const [s2] = await q(`select plan_id, current_period_end from subscriptions where organization_id = $1`, [a]);
  const days2 = (new Date(s2.current_period_end) - Date.now()) / 86_400_000;
  assert.ok(days2 > 59.9 && days2 < 60.1, 'dias se somam');
  assert.equal(s2.plan_id, 'profissional', 'troca de plano pelo pagamento');

  // Mensalidade vencida → pendente; após a carência → suspensa.
  await q(`update subscriptions set current_period_end = now() - interval '1 day' where organization_id = $1`, [a]);
  await q(`select expire_trials()`);
  assert.equal((await q(`select status from organizations where id = $1`, [a]))[0].status, 'past_due');
  await q(`update subscriptions set current_period_end = now() - interval '30 days' where organization_id = $1`, [a]);
  await q(`select expire_trials()`);
  assert.equal((await q(`select status from organizations where id = $1`, [a]))[0].status, 'suspended');

  // Locadora padrão da plataforma (LOCAKAR) nunca é suspensa pelo vencimento.
  const [{ d }] = await q(`select default_organization_id d from platform_config where id = 1`);
  if (d) {
    await q(`update organizations set status = 'active' where id = $1`, [d]);
    await q(`insert into subscriptions(organization_id, plan_id, current_period_end) values ($1, 'completo', now() - interval '60 days') on conflict (organization_id) do update set current_period_end = excluded.current_period_end`, [d]);
    await q(`select expire_trials()`);
    assert.equal((await q(`select status from organizations where id = $1`, [d]))[0].status, 'active', 'LOCAKAR intacta');
  }

  // Valor e provedor validados no banco.
  await assert.rejects(q(`insert into platform_invoices(organization_id, plan_id, amount_cents, provider) values ($1, 'completo', 50, 'asaas')`, [a]));
  await assert.rejects(q(`insert into platform_invoices(organization_id, plan_id, amount_cents, provider) values ($1, 'completo', 7990, 'paypal')`, [a]));
  console.log('✓ platform-billing SQL ok');
})().catch((e) => { console.error(e); process.exit(1); });
