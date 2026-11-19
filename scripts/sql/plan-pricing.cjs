/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): NODE_PATH=<pglite> node scripts/sql/plan-pricing.cjs */
// Planos com preço/promoção e recursos; LOCAKAR (locadora padrão) no Completo; recursos lidos por org_entitlements.
const { makeDb } = require('./saas-base.cjs');
const assert = require('assert/strict');

(async () => {
  const db = await makeDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;

  const plans = await q(`select id, price_cents, promo_price_cents, promo_active, highlight, entitlements->'features' f from plans order by sort`);
  const by = Object.fromEntries(plans.map((p) => [p.id, p]));
  assert.equal(by.essencial.price_cents, 7990);
  assert.equal(by.profissional.price_cents, 9990);
  assert.equal(by.profissional.promo_price_cents, 7990);
  assert.equal(by.completo.price_cents, 10990);
  assert.equal(by.completo.promo_active, true);
  assert.equal(by.completo.highlight, true);
  assert.equal(by.essencial.f.ai_copilot, false);
  assert.equal(by.essencial.f.periodic_checkin, false);
  assert.equal(by.profissional.f.periodic_checkin, true);
  assert.equal(by.profissional.f.ai_copilot, false);
  assert.equal(by.completo.f.ai_copilot, true);
  assert.equal(by.completo.f.tracking_selsyn, true);
  assert.equal(by.trial.price_cents, null, 'teste grátis fora da vitrine');
  const [{ ends }] = await q(`select promo_ends_at ends from plans where id = 'completo'`);
  assert.equal(new Date(ends).toISOString(), new Date('2026-12-31T23:59:59-03:00').toISOString(), 'prazo da oferta de lançamento');

  // Locadora padrão (LOCAKAR) no Completo.
  const [{ id: org }] = await q(`select default_organization_id id from platform_config where id = 1`);
  if (org) {
    const [{ plan_id }] = await q(`select plan_id from subscriptions where organization_id = $1`, [org]);
    assert.equal(plan_id, 'completo', 'LOCAKAR no Completo');
  }

  // Recursos efetivos por locadora.
  const [{ id: a }] = await q(`insert into organizations(slug,name) values ('ess-a','Essencial A') returning id`);
  await q(`insert into subscriptions(organization_id, plan_id) values ($1, 'essencial')`, [a]);
  const [{ e }] = await q(`select org_entitlements($1) e`, [a]);
  assert.equal(e.features.ai_copilot, false);
  assert.equal(e.modules.contracts, true, 'módulos básicos continuam liberados');

  // Restrições: preço negativo e selo enorme são recusados.
  await assert.rejects(q(`update plans set price_cents = -1 where id = 'essencial'`));
  await assert.rejects(q(`update plans set promo_label = repeat('x', 61) where id = 'essencial'`));

  // Idempotente: rodar de novo não duplica nem desfaz edições do Super Admin.
  await q(`update plans set price_cents = 11990 where id = 'completo'`);
  const sql = require('fs').readFileSync(require('path').resolve(__dirname, '../../supabase/migrations/20261027000000_plan_pricing.sql'), 'utf8');
  await db.exec(sql);
  const [{ price_cents }] = await q(`select price_cents from plans where id = 'completo'`);
  assert.equal(price_cents, 11990, 'reaplicar a migration preserva o preço editado');
  console.log('✓ plan-pricing SQL ok');
})().catch((e) => { console.error(e); process.exit(1); });
