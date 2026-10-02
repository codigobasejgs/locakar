/**
 * Central de meios de pagamento: matriz de combinações, ligar/desligar sem apagar configuração,
 * bloqueio de operações novas no servidor e lifecycle preservado. Banco em memória, sem rede.
 * Rodar: node scripts/check-payment-methods.cjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { infinitePayState, methodStatus, pixState } from "../src/lib/payment-methods";

process.env.ASAAS_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");
delete process.env.SUPABASE_SECRET_KEY; // auditoria vira no-op
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
class Q {
  private f: ((r: Row) => boolean)[] = [];
  private op: "select" | "update" | "upsert" = "select";
  private p: Row = {};
  private one = false;
  private headCount = false;
  constructor(private t: string) { tables[t] ??= []; }
  select(_c?: string, o?: { count?: string; head?: boolean }) { if (o?.head) this.headCount = true; return this; }
  update(p: Row) { this.op = "update"; this.p = p; return this; }
  upsert(p: Row) { this.op = "upsert"; this.p = p; return this; }
  eq(c: string, v: unknown) { this.f.push((r) => r[c] === v); return this; }
  in(c: string, v: unknown[]) { this.f.push((r) => v.includes(r[c])); return this; }
  maybeSingle() { this.one = true; return this; }
  then<A>(ok: (v: { data: unknown; error: null; count?: number }) => A) {
    const rows = tables[this.t].filter((r) => this.f.every((x) => x(r)));
    if (this.op === "update") rows.forEach((r) => Object.assign(r, this.p));
    if (this.op === "upsert") { const ex = tables[this.t].find((r) => r.id === this.p.id); if (ex) Object.assign(ex, this.p); else tables[this.t].push({ ...this.p }); }
    if (this.headCount) return Promise.resolve(ok({ data: null, error: null, count: rows.length }));
    return Promise.resolve(ok({ data: this.one ? (rows[0] ?? null) : rows, error: null }));
  }
}
const db = {
  from: (t: string) => new Q(t),
  rpc: async (_name: string, { p_method, p_enabled }: { p_method: string; p_enabled: boolean }) => {
    const data = tables.settings[0].data as Record<string, Row>;
    const key = p_method === "pix_manual" ? "pix" : "infinitepay";
    data[key] = { ...data[key], enabled: p_enabled };
    return { data: null, error: null };
  },
} as never;

(async () => {
  // ---------- Estados puros ----------
  assert.equal(methodStatus(true, true), "active");
  assert.equal(methodStatus(false, true), "inactive");
  assert.equal(methodStatus(true, false), "not_configured");
  assert.equal(methodStatus(false, false, "falhou"), "error");
  const pix = { key: "27.346.981/0001-44", keyType: "cnpj", name: "LOCAKAR", city: "INDAIATUBA" } as const;
  assert.equal(pixState(pix).status, "active", "PIX antigo sem `enabled` continua ligado");
  assert.equal(pixState({ ...pix, enabled: false }).status, "inactive");
  assert.equal(pixState({ ...pix, key: "" }).status, "not_configured");
  const ip = { enabled: true, handle: "locakar", mode: "both", docNumber: "", tapCheckAccount: false } as const;
  assert.deepEqual([infinitePayState(ip).checkout, infinitePayState(ip).tap], [true, true]);
  assert.equal(infinitePayState({ ...ip, mode: "checkout", handle: "" }).configured, false);
  assert.equal(infinitePayState({ ...ip, mode: "tap", handle: "" }).configured, true, "InfiniteTap não exige InfiniteTag");
  assert.equal(infinitePayState({ ...ip, enabled: false }).checkout, false);

  // ---------- Servidor: fonte de verdade, ligar/desligar, matriz ----------
  const crypto = await import("../src/lib/server/asaas-crypto");
  const pm = await import("../src/lib/server/payment-methods");
  const asaasRow = { id: 1, enabled: false, environment: "sandbox", methods: ["PIX"], allow_undefined: true, sandbox_key_enc: crypto.encryptSecret("$aact_hmlg_" + "z".repeat(40)), sandbox_key_last4: "zzzz", sandbox_verified_at: "2026-10-02", sandbox_webhook_id: "wh", sandbox_webhook_hash: crypto.tokenHash(crypto.newWebhookToken()), last_error: null };
  tables.asaas_config = [asaasRow];
  tables.settings = [{ id: 1, data: { pix: { ...pix }, infinitepay: { ...ip, enabled: false }, company: { legalName: "LOCAKAR" } } }];
  tables.payment_transactions = [{ id: "t1", provider: "asaas", status: "link_created" }];
  tables.payment_receipts = [{ id: "r1", status: "pending_review" }];
  const actor = { id: "staff-1" };
  const usable = async () => (await pm.getPaymentMethods(db)).methods.filter(pm.usable).map((m) => m.id).sort().join(",");

  const matrix: [boolean, boolean, boolean][] = [];
  for (const a of [true, false]) for (const i of [true, false]) for (const p of [true, false]) matrix.push([a, i, p]);
  const report: string[] = [];
  for (const [a, i, p] of matrix) {
    await pm.setMethodEnabled(db, "asaas", a, actor);
    await pm.setMethodEnabled(db, "infinitepay", i, actor);
    await pm.setMethodEnabled(db, "pix_manual", p, actor);
    const expected = [a && "asaas", i && "infinitepay", p && "pix_manual"].filter(Boolean).sort().join(",");
    assert.equal(await usable(), expected, `matriz ${a}/${i}/${p}`);
    for (const [id, on] of [["asaas", a], ["infinitepay", i], ["pix_manual", p]] as const) {
      if (on) await pm.assertMethodEnabled(db, id);
      else await assert.rejects(pm.assertMethodEnabled(db, id), /desativad/, `${id} desligado bloqueia operação nova`);
    }
    report.push(`${a ? "ON " : "OFF"} | ${i ? "ON " : "OFF"} | ${p ? "ON " : "OFF"} | ${expected || "nenhum (estado vazio no app)"}`);
  }

  // Desligar não apaga configuração/credenciais; religar recupera tudo
  await pm.setMethodEnabled(db, "pix_manual", false, actor);
  await pm.setMethodEnabled(db, "infinitepay", false, actor);
  await pm.setMethodEnabled(db, "asaas", false, actor);
  const data = tables.settings[0].data as Record<string, Row>;
  assert.equal(data.pix.key, pix.key);
  assert.equal(data.infinitepay.handle, "locakar");
  assert.equal((data.company as Row).legalName, "LOCAKAR", "outras configurações intactas");
  assert.ok(tables.asaas_config[0].sandbox_key_enc && tables.asaas_config[0].sandbox_webhook_hash);
  await pm.setMethodEnabled(db, "pix_manual", true, actor);
  assert.equal(await usable(), "pix_manual");

  // Ligar sem configuração é recusado
  await pm.setMethodEnabled(db, "pix_manual", false, actor);
  (tables.settings[0].data as Record<string, Row>).pix.key = "";
  await assert.rejects(pm.setMethodEnabled(db, "pix_manual", true, actor), /Configure este meio/);
  (tables.settings[0].data as Record<string, Row>).pix.key = pix.key;
  tables.asaas_config[0].sandbox_verified_at = null;
  await assert.rejects(pm.setMethodEnabled(db, "asaas", true, actor), /Configure este meio/);
  tables.asaas_config[0].sandbox_verified_at = "2026-10-02";

  // Cobranças/análises abertas (aviso antes de desativar)
  assert.equal(await pm.openCount(db, "asaas"), 1);
  assert.equal(await pm.openCount(db, "pix_manual"), 1);

  // Resposta pública sem segredos
  const pub = JSON.stringify((await pm.getPaymentMethods(db)).methods);
  assert.ok(!pub.includes("aact") && !pub.includes(String(tables.asaas_config[0].sandbox_key_enc)) && !pub.includes(String(tables.asaas_config[0].sandbox_webhook_hash)));

  // ---------- Bloqueios no código: operação nova bloqueada, lifecycle livre ----------
  const ipRoute = read("src/app/api/payments/infinitepay/route.ts");
  assert.ok(ipRoute.includes("newOperation && !infinitePayState(cfg.ip).enabled"), "InfinitePay bloqueia só operações novas no painel");
  const tenantIp = read("src/app/api/tenant/infinitepay/route.ts");
  assert.ok(tenantIp.indexOf('if (!cfg?.enabled') > tenantIp.indexOf('body.action === "checkout"'), "app: só a criação de checkout é bloqueada; 'check' segue");
  assert.ok(read("src/app/api/tenant/receipts/route.ts").includes("settings.pix.enabled === false"), "PIX manual desligado recusa comprovante novo");
  assert.ok(!read("src/app/api/payments/receipt/route.ts").includes("pix.enabled"), "comprovante já enviado continua podendo ser aprovado");
  assert.ok(read("src/app/api/email/route.ts").includes("chargeSettings.pix.enabled === false"));
  assert.ok(read("src/app/api/cron/alerts/route.ts").includes("settings.pix.enabled !== false"));
  assert.ok(!read("src/app/api/webhooks/asaas/route.ts").includes("readyForCharges"), "webhook Asaas não depende de estar ativo");
  const summary = read("src/app/api/tenant/summary/route.ts");
  assert.ok(summary.includes("x.paid || !pixOn ? null") && summary.includes("paymentMethods:"));
  assert.ok(read("src/app/api/payments/methods/route.ts").includes("await requireStaff()"));

  console.log("✓ meios de pagamento ok\nASAAS | INFINITEPAY | PIX MANUAL | DISPONÍVEL PARA O CLIENTE\n" + report.join("\n"));
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
