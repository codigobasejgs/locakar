/** Testes offline da integração Asaas (sem rede, sem chave real). Rodar: node scripts/check-asaas.cjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as a from "../src/lib/asaas";
import { inTestOrg } from "./test-org";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
process.env.ASAAS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

inTestOrg(async () => {
  const fakeKey = "$aact_hmlg_" + "x".repeat(40) + "TEST";

  // ---------- Chave e ambientes (prefixos oficiais) ----------
  assert.equal(a.keyEnvironment(fakeKey), "sandbox");
  assert.equal(a.keyEnvironment("$aact_prod_abc"), "production");
  assert.equal(a.validateApiKey(`  ${fakeKey} `, "sandbox"), fakeKey);
  assert.throws(() => a.validateApiKey(fakeKey, "production"), /Sandbox/);
  assert.throws(() => a.validateApiKey("$aact_prod_" + "y".repeat(30), "sandbox"), /Produção/);
  assert.throws(() => a.validateApiKey("curta", "sandbox"));
  assert.throws(() => a.validateApiKey("$aact_hmlg_ com espaço xxxxxxxxxxxx", "sandbox"));
  assert.equal(a.maskKey(a.last4(fakeKey)), "••••••••••••TEST");
  assert.equal(a.ASAAS_BASE.sandbox, "https://api-sandbox.asaas.com/v3");
  assert.equal(a.ASAAS_BASE.production, "https://api.asaas.com/v3");

  // ---------- externalReference determinístico ----------
  const id = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(a.parseTxReference(a.txReference(id)), id);
  assert.equal(a.parseTxReference("056984"), null);
  assert.equal(a.parseTxReference("locakar-tx:../x"), null);

  // ---------- Semântica de status: CONFIRMED ≠ RECEIVED, estorno, chargeback, ordem ----------
  const st = (status: string, extra: Partial<a.PaymentSnapshot> = {}) => a.stateFromSnapshot({ id: "pay_1", status, ...extra });
  assert.equal(st("PENDING"), "link_created");
  assert.equal(st("OVERDUE"), "link_created");
  assert.equal(st("CONFIRMED"), "paid");
  assert.equal(st("RECEIVED"), "paid");
  assert.equal(st("REFUND_IN_PROGRESS"), "paid"); // ainda não estornado
  assert.equal(st("REFUNDED"), "refunded");
  assert.equal(st("CHARGEBACK_REQUESTED"), "chargeback");
  assert.equal(st("CHARGEBACK_DISPUTE"), "chargeback");
  assert.equal(st("PENDING", { deleted: true }), "cancelled");
  assert.equal(st("RECEIVED", { deleted: true }), "paid"); // removida depois de paga não desfaz pagamento
  assert.equal(st("ALGUM_STATUS_NOVO"), "link_created"); // desconhecido não quebra nem quita
  assert.equal(a.refundedCents({ id: "p", refunds: [{ status: "DONE", value: 2 }, { status: "PENDING", value: 50 }, { status: "DONE", value: 0.5 }] }), 250);
  assert.equal(a.statusLabel({ status: "paid", provider_status: "CONFIRMED" }), "Confirmado");
  assert.equal(a.statusLabel({ status: "paid", provider_status: "RECEIVED" }), "Recebido");
  assert.equal(a.statusLabel({ status: "paid", provider_status: "RECEIVED", refunded_cents: 100 }), "Estorno parcial");
  assert.equal(a.statusLabel({ status: "chargeback", provider_status: "CHARGEBACK_REQUESTED" }), "Chargeback");
  assert.equal(a.statusTone({ status: "link_created", provider_status: "OVERDUE" }), "danger");

  // ---------- Payload de cobrança: não envia regras vazias ----------
  const base = { customer: "cus_1", billingType: "PIX" as const, cents: 70000, dueDate: "2026-10-10", description: "Aluguel", externalReference: a.txReference(id) };
  assert.deepEqual(a.chargePayload({ ...base, rules: {} }), { customer: "cus_1", billingType: "PIX", value: 700, dueDate: "2026-10-10", description: "Aluguel", externalReference: a.txReference(id) });
  const full = a.chargePayload({ ...base, rules: { finePercent: 2, interestPercent: 1, discountPercent: 5, discountDays: 3 } });
  assert.deepEqual(full.fine, { value: 2, type: "PERCENTAGE" });
  assert.deepEqual(full.interest, { value: 1 });
  assert.deepEqual(full.discount, { value: 5, dueDateLimitDays: 3, type: "PERCENTAGE" });
  assert.equal(a.chargePayload({ ...base, rules: { finePercent: 0 } }).fine, undefined);
  assert.throws(() => a.chargePayload({ ...base, cents: 50, rules: {} }));
  assert.throws(() => a.chargePayload({ ...base, dueDate: "10/10/2026", rules: {} }));

  // ---------- Cliente: CPF obrigatório, só dados necessários ----------
  const cust = a.customerPayload({ id: "c1", name: "Jefferson Santos", cpf: "529.982.247-25", email: "j@x.com", phone: "+55 (19) 98961-5873", cep: "13330-000", street: "Rua A", number: "10" }, true);
  assert.deepEqual(cust, { name: "Jefferson Santos", cpfCnpj: "52998224725", externalReference: "locakar-client:c1", notificationDisabled: true, email: "j@x.com", mobilePhone: "19989615873", postalCode: "13330000", address: "Rua A", addressNumber: "10" });
  assert.throws(() => a.customerPayload({ id: "c1", name: "Sem doc", cpf: "" }, true), /CPF/);

  // ---------- Erros e logs sem segredo ----------
  assert.match(a.asaasErrorMessage(401, { errors: [{ code: "invalid_environment" }] }), /ambiente/);
  assert.match(a.asaasErrorMessage(401, {}), /autenticar/);
  assert.ok(!a.asaasErrorMessage(400, { errors: [{ description: `falha ${fakeKey}` }] }).includes(fakeKey));
  const red = a.redact({ access_token: fakeKey, nested: { msg: `chave ${fakeKey}`, creditCardNumber: "4111", ccv: "123" } });
  assert.ok(!JSON.stringify(red).includes(fakeKey) && !JSON.stringify(red).includes("4111") && !JSON.stringify(red).includes('"123"'));

  // ---------- Cripto da chave (AES-256-GCM) e token do webhook ----------
  const crypto = await import("../src/lib/server/asaas-crypto");
  const enc = crypto.encryptSecret(fakeKey);
  assert.ok(!enc.includes(fakeKey) && enc.startsWith("v1:"));
  assert.equal(crypto.decryptSecret(enc), fakeKey);
  assert.notEqual(crypto.encryptSecret(fakeKey), enc); // IV aleatório
  const parts = enc.split(":");
  parts[3] = Buffer.from("adulterado").toString("base64");
  assert.throws(() => crypto.decryptSecret(parts.join(":"))); // GCM detecta adulteração
  const token = crypto.newWebhookToken();
  assert.ok(token.length >= 32 && token.length <= 255 && !/\s/.test(token));

  // ---------- Transporte: header access_token, URL por ambiente, nada na query ----------
  const server = await import("../src/lib/server/asaas");
  const calls: { url: string; init: RequestInit }[] = [];
  const ok = (body: unknown, status = 200) => async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  await server.asaasFetch("sandbox", fakeKey, "GET", "/customers?limit=1", undefined, ok({ data: [] }) as typeof fetch);
  assert.equal(calls[0].url, "https://api-sandbox.asaas.com/v3/customers?limit=1");
  assert.ok(!calls[0].url.includes(fakeKey));
  const h = calls[0].init.headers as Record<string, string>;
  assert.equal(h.access_token, fakeKey);
  assert.equal(h["User-Agent"], "LOCAKAR-SaaS");
  assert.equal(calls[0].init.redirect, "error");
  await server.asaasFetch("production", fakeKey, "POST", "/payments", { a: 1 }, ok({ id: "pay_1" }) as typeof fetch);
  assert.equal(calls[1].url, "https://api.asaas.com/v3/payments");
  // 401 do Asaas não vira "sessão expirada" (401) no painel
  await assert.rejects(server.asaasFetch("sandbox", fakeKey, "GET", "/x", undefined, ok({ errors: [{ code: "invalid_access_token" }] }, 401) as typeof fetch), (e: InstanceType<typeof server.AsaasError>) => e.status === 424 && e.upstream === 401 && !e.message.includes(fakeKey));
  // Timeout em POST é inconclusivo (pode ter criado) → fluxo consulta antes de repetir
  const timeout = (async () => {
    const err = new Error("timeout");
    err.name = "TimeoutError";
    throw err;
  }) as unknown as typeof fetch;
  await assert.rejects(server.asaasFetch("sandbox", fakeKey, "POST", "/payments", {}, timeout), (e: InstanceType<typeof server.AsaasError>) => e.inconclusive && e.status === 504);
  await assert.rejects(server.asaasFetch("sandbox", fakeKey, "GET", "/payments", undefined, timeout), (e: InstanceType<typeof server.AsaasError>) => !e.inconclusive);
  await assert.rejects(server.asaasFetch("sandbox", fakeKey, "POST", "/payments", {}, ok({}, 500) as typeof fetch), (e: InstanceType<typeof server.AsaasError>) => e.inconclusive && e.status === 502);

  // ---------- Visão pública: nunca devolve chave/hash ----------
  const cfgRow = { enabled: true, environment: "sandbox", methods: ["PIX"], allow_undefined: true, sandbox_key_enc: enc, sandbox_key_last4: "TEST", sandbox_verified_at: "2026-10-02", sandbox_webhook_id: "wh_1", sandbox_webhook_hash: crypto.tokenHash(token) } as unknown as Parameters<typeof server.publicConfig>[0];
  const pub = JSON.stringify(server.publicConfig(cfgRow));
  assert.ok(!pub.includes(enc) && !pub.includes(fakeKey) && !pub.includes(crypto.tokenHash(token)) && pub.includes("••••TEST"));
  assert.ok(server.readyForCharges(cfgRow));
  assert.ok(!server.readyForCharges({ ...cfgRow!, enabled: false }));
  assert.ok(!server.readyForCharges({ ...cfgRow!, sandbox_verified_at: null }));

  // ---------- Webhook: autenticação por token e validação do payload ----------
  const wh = await import("../src/lib/server/asaas-webhook");
  assert.equal(wh.webhookEnvironment(cfgRow, token), "sandbox");
  assert.equal(wh.webhookEnvironment(cfgRow, token + "x"), null);
  assert.equal(wh.webhookEnvironment(cfgRow, null), null);
  assert.equal(wh.webhookEnvironment(cfgRow, fakeKey), null); // API Key não autentica webhook
  assert.deepEqual(wh.parseEvent({ id: "evt_1&9", event: "PAYMENT_RECEIVED", payment: { id: "pay_1", novoCampo: 1 } })?.event, "PAYMENT_RECEIVED");
  assert.equal(wh.parseEvent({ id: "evt_1", event: "PAYMENT_X" })?.payment, null); // evento sem payment é aceito e ignorado
  assert.equal(wh.parseEvent({ event: "PAYMENT_RECEIVED" }), null);
  assert.equal(wh.parseEvent({ id: "x", event: "drop table;" }), null);

  // ---------- Estrutura: segurança verificável no código ----------
  const route = read("src/app/api/webhooks/asaas/route.ts");
  assert.ok(route.includes('request.headers.get("asaas-access-token")') && route.includes("ignoreDuplicates: true") && route.includes("status: 401"));
  assert.ok(route.indexOf("upsert") < route.indexOf("after("), "persiste antes de processar");
  for (const f of ["src/app/api/asaas/config/route.ts", "src/app/api/asaas/charges/route.ts"]) assert.ok(read(f).includes("await requireStaff()"), `${f} exige equipe`);
  assert.ok(read("src/app/api/tenant/asaas/route.ts").includes("tx.client_id !== clientId"));
  for (const f of ["src/components/admin/asaas-settings.tsx", "src/components/admin/asaas-charge-dialog.tsx", "apps/locatario/components/domain/AsaasPay.tsx", "apps/locatario/app/(tabs)/pagamentos.tsx"]) {
    const src = read(f);
    assert.ok(!/localStorage|sessionStorage|api\.asaas\.com|api-sandbox\.asaas|access_token/.test(src), `${f} não fala com o Asaas nem guarda a chave`);
    assert.ok(!/from "@\/lib\/server\/asaas(-crypto)?"/.test(src.replace(/import type[^\n]+\n/g, "")), `${f} não importa código de servidor`);
  }
  assert.ok(!/NEXT_PUBLIC_ASAAS/.test(read(".env.example")));
  const sql = read("supabase/migrations/20261008000000_asaas.sql");
  assert.ok(sql.includes("revoke all on public.%I from anon, authenticated") && sql.includes("payment_transactions_asaas_active_idx") && sql.includes("id           text primary key"));
  assert.ok(!/key_enc|webhook_hash/.test(sql.slice(sql.indexOf("grant select"), sql.indexOf("-- ---------- Configuração"))), "colunas secretas nunca liberadas ao authenticated");

  console.log("✓ asaas offline check ok (sem chamadas reais)");
}).catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
