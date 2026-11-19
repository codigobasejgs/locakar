// Planos Frota Easy: preço exibido (promoção liga/desliga) e recursos liberados por plano.
import assert from "node:assert/strict";
import { DEFAULT_PLANS, PLAN_FEATURES, planHasFeature, planPrice, sellable } from "../src/lib/plans";

const plan = (id: string) => DEFAULT_PLANS.find((p) => p.id === id)!;

// ---------- Preço ----------
assert.deepEqual(planPrice(plan("profissional")), { cents: 7990, fromCents: 9990, promo: true }, "Profissional: De 99,90 por 79,90");
assert.deepEqual(planPrice(plan("completo")), { cents: 7990, fromCents: 10990, promo: true }, "Completo: De 109,90 por 79,90");
assert.deepEqual(planPrice(plan("essencial")), { cents: 7990, fromCents: null, promo: false }, "Essencial: 79,90 sem riscado");
assert.deepEqual(planPrice({ ...plan("completo"), promo_active: false }), { cents: 10990, fromCents: null, promo: false }, "promoção desligada volta ao preço de tabela");
assert.deepEqual(planPrice({ price_cents: 11990, promo_price_cents: 7990, promo_active: true }), { cents: 7990, fromCents: 11990, promo: true }, "reajuste de tabela mantém a promoção");
assert.equal(planPrice({ price_cents: 7990, promo_price_cents: 9990, promo_active: true }).promo, false, "promo maior que a tabela não vira De/Por");
assert.equal(planPrice({ price_cents: 7990, promo_price_cents: null, promo_active: true }).cents, 7990, "promo sem valor usa tabela");
assert.deepEqual(sellable(DEFAULT_PLANS).map((p) => p.id), ["essencial", "profissional", "completo"], "vitrine na ordem");
assert.deepEqual(sellable([...DEFAULT_PLANS, { ...plan("essencial"), id: "trial", price_cents: null, sort: 0 }]).map((p) => p.id).includes("trial"), false, "teste grátis fora da vitrine");

// ---------- Recursos ----------
const on = (id: string) => PLAN_FEATURES.filter((f) => planHasFeature(plan(id).entitlements, f));
assert.deepEqual(on("essencial"), [], "Essencial: sem IA, sem check-in, sem botões, sem rastreamento");
assert.deepEqual(on("profissional").sort(), ["periodic_checkin", "smart_contracts", "whatsapp_buttons"], "Profissional");
assert.deepEqual(on("completo").sort(), [...PLAN_FEATURES].sort(), "Completo: tudo");
assert.equal(planHasFeature(plan("profissional").entitlements, "ai_copilot"), false, "Profissional sem IA multimodal");

// Locadoras antigas sem features no plano (ou sem assinatura) não perdem nada.
assert.equal(planHasFeature(null, "ai_copilot"), true);
assert.equal(planHasFeature({ modules: {} }, "tracking_selsyn"), true);
assert.equal(planHasFeature({ features: { ai_copilot: false } }, "periodic_checkin"), true, "só false explícito bloqueia");

console.log("✓ plans ok");
