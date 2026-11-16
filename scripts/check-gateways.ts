// Gateways de link (Mercado Pago, PagBank, Pagar.me): payloads, leitura das respostas, decisão de baixa e assinaturas.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { verifyMercadoPago, verifyPagBank, sameTokenHash, sha256Hex } from "../src/lib/gateway-signature";
import {
  credentialProblem,
  decideGateway,
  gatewayMethodLabel,
  linkFromResponse,
  mercadoPagoPreference,
  pagBankCheckout,
  pagarmeLink,
  readMercadoPagoPayment,
  readPagBankOrder,
  readPagarmeOrder,
} from "../src/lib/gateways";
import { PAYMENT_METHOD_IDS, PAYMENT_METHODS, isGatewayMethod } from "../src/lib/payment-methods";

const tx = "3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e";
const input = {
  txId: tx,
  cents: 37850,
  title: "Aluguel ABC1D23 - parcela 2 - venc. 06/11/2026",
  customer: { name: "Maria Souza", email: "maria@ex.com", phone: "(11) 90000-1111", cpf: "529.982.247-25" },
  returnUrl: `https://www.locakar.com.br/pagamento/retorno?g=x&ref=${tx}`,
  notifyUrl: "https://www.locakar.com.br/api/webhooks/gateways/x?o=org",
  expiresAt: "2026-11-19T12:00:00-00:00",
};

// ---------- Credenciais ----------
assert.equal(credentialProblem("mercadopago", "production", "APP_USR-1234567890123456-abcdef"), null);
assert.match(credentialProblem("mercadopago", "production", "abc1234567890123456789")!, /APP_USR/);
assert.match(credentialProblem("pagarme", "sandbox", "sk_live_12345678901234567890")!, /sk_test/);
assert.equal(credentialProblem("pagarme", "production", "sk_live_12345678901234567890"), null);
assert.match(credentialProblem("pagbank", "production", "curto")!, /inválido/);
assert.match(credentialProblem("pagbank", "production", "token com espaço 1234567890")!, /inválido/);

// ---------- Payloads ----------
const mp = mercadoPagoPreference(input);
assert.equal(mp.external_reference, tx);
assert.equal(mp.items[0].unit_price, 378.5, "MP usa reais");
assert.equal(mp.notification_url, input.notifyUrl);
assert.equal(mp.auto_return, "approved");
const pb = pagBankCheckout(input);
assert.equal(pb.reference_id, tx);
assert.equal(pb.items[0].unit_amount, 37850, "PagBank usa centavos");
assert.deepEqual(pb.payment_notification_urls, [input.notifyUrl]);
assert.deepEqual(pb.customer, { name: "Maria Souza", email: "maria@ex.com", tax_id: "52998224725", phone: { country: "+55", area: "11", number: "900001111" } });
assert.equal(pagBankCheckout({ ...input, customer: { name: "Maria" } }).customer, undefined, "cliente incompleto: PagBank pede os dados no checkout");
const pm = pagarmeLink(input);
assert.equal(pm.order_code, tx);
assert.equal(pm.max_paid_sessions, 1, "link de um pagamento só");
assert.equal(pm.cart_settings.items[0].amount, 37850);
assert.ok(pm.cart_settings.items[0].description.includes(tx), "referência também na descrição (reserva)");
assert.equal(pm.payment_settings.credit_card_settings.installments_setup.amount, 37850);
assert.throws(() => mercadoPagoPreference({ ...input, cents: 99 }), /mínimo/);
assert.throws(() => pagarmeLink({ ...input, txId: "x" }), /Referência/);

// ---------- Link na resposta ----------
assert.deepEqual(linkFromResponse("mercadopago", "production", { id: "123-abc", init_point: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1", sandbox_init_point: "https://sandbox.mercadopago.com.br/x" }), { url: "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1", providerId: "123-abc" });
assert.equal(linkFromResponse("mercadopago", "sandbox", { id: "1", init_point: "https://a/x", sandbox_init_point: "https://sandbox/x" })?.url, "https://sandbox/x");
assert.equal(linkFromResponse("pagbank", "production", { id: "CHEC_1", links: [{ rel: "SELF", href: "https://api/x" }, { rel: "PAY", href: "https://pagamento.pagbank.com.br/pagamento?code=1" }] })?.url, "https://pagamento.pagbank.com.br/pagamento?code=1");
assert.equal(linkFromResponse("pagarme", "production", { id: "pl_1", url: "https://payment-link.pagar.me/pl_1" })?.providerId, "pl_1");
assert.equal(linkFromResponse("pagarme", "production", { id: "pl_1", url: "javascript:alert(1)" }), null, "só https");

// ---------- Leitura do pagamento ----------
const mpPaid = readMercadoPagoPayment({ id: 999, status: "approved", transaction_amount: 378.5, payment_type_id: "credit_card", payment_method_id: "visa", installments: 3, external_reference: tx });
assert.deepEqual(mpPaid, { paid: true, cents: 37850, method: "credit_card", installments: 3, paymentId: "999", reference: tx, refunded: false });
assert.equal(readMercadoPagoPayment({ status: "approved", payment_method_id: "pix", payment_type_id: "bank_transfer", transaction_amount: 10 }).method, "pix");
assert.equal(readMercadoPagoPayment({ status: "pending" }).paid, false);
const pbPaid = readPagBankOrder({ id: "ORDE_1", reference_id: tx, charges: [{ id: "CHAR_1", status: "PAID", amount: { value: 37850, summary: { total: 37850, paid: 37850 } }, payment_method: { type: "PIX" } }] });
assert.deepEqual([pbPaid.paid, pbPaid.cents, pbPaid.method, pbPaid.reference, pbPaid.paymentId], [true, 37850, "pix", tx, "ORDE_1"]);
assert.equal(readPagBankOrder({ reference_id: tx, charges: [{ status: "WAITING" }] }).paid, false);
const pmPaid = readPagarmeOrder({ id: "or_1", code: tx, status: "paid", amount: 37850, charges: [{ status: "paid", amount: 37850, payment_method: "credit_card", last_transaction: { installments: 2 } }] });
assert.deepEqual([pmPaid.paid, pmPaid.cents, pmPaid.method, pmPaid.installments, pmPaid.reference], [true, 37850, "credit_card", 2, tx]);
assert.equal(readPagarmeOrder({ id: "or_2", code: "XYZ", status: "paid", items: [{ description: `Aluguel · ref ${tx}` }], charges: [{ status: "paid", amount: 1 }] }).reference, tx, "code gerado pela Pagar.me: referência vem da descrição");

// ---------- Decisão de baixa ----------
const open = { id: tx, status: "link_created", amount_cents: 37850 };
assert.equal(decideGateway(open, mpPaid), "paid");
assert.equal(decideGateway({ ...open, status: "paid" }, mpPaid), "already");
assert.equal(decideGateway(open, { ...mpPaid, paid: false }), "pending");
assert.equal(decideGateway(open, null), "pending");
assert.equal(decideGateway(open, { ...mpPaid, cents: 37849 }), "mismatch", "pagou menos: não baixa");
assert.equal(decideGateway(open, { ...mpPaid, cents: 40000 }), "paid", "juros de parcelamento do cartão podem deixar maior");
assert.equal(decideGateway(open, { ...mpPaid, reference: "outro-id" }), "foreign", "pagamento de outra cobrança nunca quita esta parcela");

// ---------- Rótulos ----------
assert.equal(gatewayMethodLabel("mercadopago", "credit_card", 3), "Mercado Pago · Cartão de Crédito 3x");
assert.equal(gatewayMethodLabel("pagarme", "pix", 1), "Pagar.me · Pix");
assert.equal(gatewayMethodLabel("pagbank", "boleto", null), "PagBank · Boleto");

// ---------- Central de meios ----------
assert.deepEqual(PAYMENT_METHOD_IDS, ["asaas", "infinitepay", "mercadopago", "pagbank", "pagarme", "pix_manual"]);
assert.ok(isGatewayMethod("pagbank") && !isGatewayMethod("asaas"));
assert.equal(PAYMENT_METHODS.pagarme.label, "Pagar.me (Stone/Ton)");

// ---------- Assinaturas ----------
const secret = "s3cr3tAssinaturaMP1234567890";
const ts = "1742505638683";
const manifest = `id:123456;request-id:bb56a2f1-6aae-46ac-982e-9dcd3581d08e;ts:${ts};`;
const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
const good = { xSignature: `ts=${ts},v1=${v1}`, xRequestId: "bb56a2f1-6aae-46ac-982e-9dcd3581d08e", dataId: "123456", secret };
assert.ok(verifyMercadoPago(good));
assert.ok(!verifyMercadoPago({ ...good, dataId: "123457" }), "outro pagamento");
assert.ok(!verifyMercadoPago({ ...good, secret: "outro" }));
assert.ok(!verifyMercadoPago({ ...good, xSignature: null }));
assert.ok(!verifyMercadoPago({ ...good, now: Number(ts) + 3_600_000, toleranceSeconds: 600 }), "replay antigo recusado");
assert.ok(verifyMercadoPago({ ...good, now: Number(ts) + 60_000, toleranceSeconds: 600 }));
const raw = '{"id":"ORDE_1","reference_id":"x"}';
const pbSig = createHash("sha256").update(`TOKEN123-${raw}`).digest("hex");
assert.ok(verifyPagBank(raw, "TOKEN123", pbSig));
assert.ok(!verifyPagBank(raw.replace("x", "y"), "TOKEN123", pbSig), "corpo alterado");
assert.ok(!verifyPagBank(raw, "TOKEN123", null));
assert.ok(sameTokenHash("abc", sha256Hex("abc")) && !sameTokenHash("abd", sha256Hex("abc")) && !sameTokenHash("abc", null));

console.log("✓ gateways ok");
