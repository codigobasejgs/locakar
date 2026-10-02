/**
 * Fluxo ponta a ponta com banco em memória e Asaas simulado (sem rede): cobrar → webhook → baixa,
 * webhook duplicado, fora de ordem, estorno, chargeback, timeout na criação e concorrência.
 * Rodar: node scripts/check-asaas-flow.cjs
 */
import assert from "node:assert/strict";
import { txReference, type PaymentSnapshot } from "../src/lib/asaas";

process.env.ASAAS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
delete process.env.SUPABASE_SECRET_KEY; // audit/push/notificações viram no-op neste teste

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

/** Restrições reais da migration, reproduzidas aqui. */
function violates(table: string, row: Row, self?: Row) {
  const rows = (tables[table] ?? []).filter((r) => r !== self);
  if (table === "payment_transactions") {
    if (row.provider === "asaas" && ["started", "link_created"].includes(row.status as string) && rows.some((r) => r.provider === "asaas" && r.rental_id === row.rental_id && r.receipt_id === row.receipt_id && ["started", "link_created"].includes(r.status as string))) return true;
    if (row.status === "paid" && rows.some((r) => r.rental_id === row.rental_id && r.receipt_id === row.receipt_id && r.status === "paid")) return true;
    if (row.provider_payment_id && rows.some((r) => r.provider === row.provider && r.provider_payment_id === row.provider_payment_id)) return true;
  }
  if (table === "asaas_webhook_events" && rows.some((r) => r.id === row.id)) return true;
  return false;
}

class Q implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private wantRows = false;
  private mode: "many" | "single" | "maybe" = "many";
  private lim = Infinity;
  private orderBy: { col: string; asc: boolean } | null = null;
  constructor(private table: string) {
    tables[table] ??= [];
  }
  select() { this.wantRows = true; return this; }
  insert(p: Row | Row[]) { this.op = "insert"; this.payload = p; return this; }
  update(p: Row) { this.op = "update"; this.payload = p; return this; }
  upsert(p: Row | Row[], o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) { this.op = "upsert"; this.payload = p; this.opts = o; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, v: unknown[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  not(c: string, op: string, v: string) { const list = v.replace(/[()]/g, "").split(","); this.filters.push((r) => !list.includes(String(r[c]))); return this; }
  lt(c: string, v: unknown) { this.filters.push((r) => (r[c] as never) < (v as never)); return this; }
  or(expr: string) {
    // usado só em processEvent: status em (pending,error) OU processing travado há muito tempo
    const stale = /locked_at\.lt\.([^)]+)\)/.exec(expr)?.[1] ?? "";
    this.filters.push((r) => ["pending", "error"].includes(r.status as string) || (r.status === "processing" && String(r.locked_at) < stale));
    return this;
  }
  order(col: string, o: { ascending?: boolean } = {}) { this.orderBy = { col, asc: o.ascending !== false }; return this; }
  limit(n: number) { this.lim = n; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  private run(): { data: unknown; error: unknown } {
    const t = tables[this.table];
    const match = () => t.filter((r) => this.filters.every((f) => f(r)));
    let out: Row[] = [];
    if (this.op === "insert" || this.op === "upsert") {
      for (const p of [this.payload].flat() as Row[]) {
        const row: Row = { id: p.id ?? uuid(), status: this.table === "payment_transactions" ? "started" : this.table === "asaas_webhook_events" ? "pending" : undefined, attempts: 0, refunded_cents: 0, created_at: new Date(Date.now() + seq).toISOString(), received_at: new Date(0).toISOString(), ...p };
        const pk = this.opts.onConflict === "id" ? t.find((r) => r.id === row.id) : this.table === "asaas_customers" ? t.find((r) => r.client_id === row.client_id && r.environment === row.environment) : undefined;
        if (pk) {
          if (this.opts.ignoreDuplicates) continue;
          Object.assign(pk, p);
          out.push(pk);
          continue;
        }
        if (violates(this.table, row)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        t.push(row);
        out.push(row);
      }
    } else if (this.op === "update") {
      for (const r of match()) {
        const next = { ...r, ...(this.payload as Row) };
        if (violates(this.table, next, r)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        Object.assign(r, this.payload, { updated_at: new Date().toISOString() });
        out.push(r);
      }
    } else out = match();
    if (this.orderBy) { const { col, asc } = this.orderBy; out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1)); }
    out = out.slice(0, this.lim).map((r) => ({ ...r }));
    if (this.op !== "select" && !this.wantRows) return { data: null, error: null };
    if (this.mode === "many") return { data: out, error: null };
    if (this.mode === "single" && out.length !== 1) return { data: null, error: { code: "PGRST116", message: "not single" } };
    return { data: out[0] ?? null, error: null };
  }
  then<A = { data: unknown; error: unknown }, B = never>(ok?: ((v: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> { return Promise.resolve(this.run()).then(ok, ko); }
}
const db = { from: (t: string) => new Q(t) } as never;

// ---------- Asaas simulado ----------
const remote: Record<string, PaymentSnapshot & Row> = {};
let created = 0;
let failNextCreate: "timeout-but-created" | "timeout-not-created" | null = null;
const calls: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const path = url.pathname.replace(/^\/v3/, "");
  const method = init?.method ?? "GET";
  calls.push(`${method} ${path}`);
  assert.ok(!url.search.includes("aact"), "chave nunca vai na URL");
  assert.ok(String((init?.headers as Record<string, string>).access_token).startsWith("$aact_hmlg_"));
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
  if (path === "/customers" && method === "GET") return json({ data: url.searchParams.get("cpfCnpj") === "52998224725" && created > 0 ? [{ id: "cus_1" }] : [] });
  if (path === "/customers" && method === "POST") return json({ id: "cus_1" });
  if (path === "/payments" && method === "POST") {
    const body = JSON.parse(String(init!.body));
    const id = `pay_${++created}`;
    remote[id] = { id, status: "PENDING", value: body.value, billingType: body.billingType, dueDate: body.dueDate, externalReference: body.externalReference, invoiceUrl: `https://sandbox.asaas.com/i/${id}`, customer: body.customer };
    if (failNextCreate === "timeout-but-created") { failNextCreate = null; const e = new Error("t"); e.name = "TimeoutError"; throw e; }
    return json(remote[id]);
  }
  if (path === "/payments" && method === "GET") return json({ data: Object.values(remote).filter((p) => p.externalReference === url.searchParams.get("externalReference")) });
  const m = /^\/payments\/([^/]+)$/.exec(path);
  if (m && method === "GET") return remote[m[1]] ? json(remote[m[1]]) : json({ errors: [{ code: "not_found" }] }, 404);
  if (m && method === "DELETE") { remote[m[1]].deleted = true; return json({ deleted: true, id: m[1] }); }
  if (/\/pixQrCode$/.test(path)) return json({ encodedImage: "iVBOR", payload: "00020126…", expirationDate: "2026-10-10" });
  return json({ errors: [{ code: "unexpected", description: path }] }, 400);
}) as typeof fetch;
// Timeout sem criar nada: intercepta antes do mock acima.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (i: string | URL | Request, init?: RequestInit) => {
  if (failNextCreate === "timeout-not-created" && init?.method === "POST" && String(i).endsWith("/payments")) { failNextCreate = null; const e = new Error("t"); e.name = "TimeoutError"; throw e; }
  return realFetch(i, init);
}) as typeof fetch;

(async () => {
  const crypto = await import("../src/lib/server/asaas-crypto");
  const s = await import("../src/lib/server/asaas");
  const wh = await import("../src/lib/server/asaas-webhook");
  const today = (await import("../src/lib/utils")).todaySP();
  const future = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);

  tables.clients = [{ id: "c1", name: "Jefferson Santos", cpf: "529.982.247-25", email: null, phone: "19989615873" }];
  tables.vehicles = [{ id: "v1", name: "Fiat Mobi", plate: "ABC1D23" }];
  tables.rentals = [{ id: "r1", client_id: "c1", vehicle_id: "v1", start_date: today, end_date: future, weekly_rate: 700, receipts: [{ id: "p1", dueDate: future, amount: 700, paid: false }, { id: "p2", dueDate: future, amount: 700, paid: false }] }];
  const token = crypto.newWebhookToken();
  tables.asaas_config = [{ id: 1, enabled: true, environment: "sandbox", methods: ["PIX", "BOLETO", "CREDIT_CARD"], allow_undefined: true, notify_asaas: false, sandbox_key_enc: crypto.encryptSecret("$aact_hmlg_" + "k".repeat(40)), sandbox_key_last4: "kkkk", sandbox_verified_at: today, sandbox_webhook_id: "wh", sandbox_webhook_hash: crypto.tokenHash(token) }];
  const cfg = (await s.loadAsaasConfig(db))!;
  const receipt = (id: string) => ((tables.rentals[0].receipts as Row[]).find((r) => r.id === id)!);
  const actor = { type: "staff" as const, id: "u1" };

  // 1. Cobrar: cria cliente uma vez, cobrança com externalReference determinístico
  const r1 = await s.createCharge(db, cfg, { rentalId: "r1", receiptId: "p1", billingType: "PIX", actor });
  assert.equal(r1.reused, false);
  assert.equal(r1.tx.status, "link_created");
  assert.equal(r1.tx.provider_payment_id, "pay_1");
  assert.equal(remote.pay_1.externalReference, txReference(r1.tx.id));
  assert.equal(remote.pay_1.value, 700);
  assert.equal(tables.asaas_customers.length, 1);

  // 2. Clicar de novo / outra aba: reaproveita, não cria outra cobrança
  const again = await s.createCharge(db, cfg, { rentalId: "r1", receiptId: "p1", billingType: "BOLETO", actor });
  assert.equal(again.reused, true);
  assert.equal(created, 1);
  // Duplo clique simultâneo em outra parcela: só uma cobrança
  const both = await Promise.allSettled([s.createCharge(db, cfg, { rentalId: "r1", receiptId: "p2", billingType: "PIX", actor }), s.createCharge(db, cfg, { rentalId: "r1", receiptId: "p2", billingType: "PIX", actor })]);
  assert.equal(created, 2, "concorrência gera uma única cobrança no Asaas");
  assert.ok(both.some((x) => x.status === "fulfilled"));
  assert.equal(tables.asaas_customers.length, 1, "cliente Asaas reutilizado");
  // Método não habilitado é recusado no servidor
  tables.asaas_config[0].methods = ["PIX"];
  tables.asaas_config[0].allow_undefined = false;
  const cfgPixOnly = (await s.loadAsaasConfig(db))!;
  tables.rentals[0].receipts = [...(tables.rentals[0].receipts as Row[]), { id: "p3", dueDate: future, amount: 700, paid: false }];
  await assert.rejects(s.createCharge(db, cfgPixOnly, { rentalId: "r1", receiptId: "p3", billingType: "CREDIT_CARD", actor }), /não habilitada/);
  tables.asaas_config[0].methods = ["PIX", "BOLETO", "CREDIT_CARD"];
  tables.asaas_config[0].allow_undefined = true;

  // 3. Webhook PAYMENT_CONFIRMED (fora de ordem: RECEIVED chega depois) → baixa uma vez
  const deliver = async (id: string, event: string, paymentId: string) => {
    const body = { id, event, payment: { ...remote[paymentId] } };
    assert.equal(wh.webhookEnvironment(cfg, token), "sandbox");
    const { data } = await (db as { from: (t: string) => Q }).from("asaas_webhook_events").upsert({ id, environment: "sandbox", event, payment_id: paymentId, payload: body }, { onConflict: "id", ignoreDuplicates: true }).select();
    if ((data as Row[]).length) await wh.processEvent(db, id);
    return (data as Row[]).length;
  };
  remote.pay_1.status = "CONFIRMED";
  remote.pay_1.paymentDate = today;
  assert.equal(await deliver("evt_1", "PAYMENT_CONFIRMED", "pay_1"), 1);
  assert.equal(receipt("p1").paid, true);
  assert.equal(receipt("p1").amountPaid, 700);
  assert.equal(receipt("p1").settledBy, "Asaas");
  assert.match(String(receipt("p1").paymentMethod), /Asaas · Pix/);
  // Mesmo evento reenviado: nenhum efeito novo
  const notes = receipt("p1").notes;
  assert.equal(await deliver("evt_1", "PAYMENT_CONFIRMED", "pay_1"), 0);
  assert.equal(tables.asaas_webhook_events.length, 1);
  assert.equal(receipt("p1").notes, notes);
  // Evento antigo (PAYMENT_CREATED) chega atrasado: decisão vem do GET atual, não rebaixa
  assert.equal(await deliver("evt_0", "PAYMENT_CREATED", "pay_1"), 1);
  assert.equal(receipt("p1").paid, true);
  // RECEIVED depois: só atualiza o status do provider (confirmado → recebido), sem baixar de novo
  remote.pay_1.status = "RECEIVED";
  await deliver("evt_2", "PAYMENT_RECEIVED", "pay_1");
  const tx1 = tables.payment_transactions.find((t) => t.provider_payment_id === "pay_1")!;
  assert.equal(tx1.status, "paid");
  assert.equal(tx1.provider_status, "RECEIVED");
  assert.equal(receipt("p1").notes, notes);

  // 4. Estorno parcial mantém paga; estorno total reabre preservando histórico
  remote.pay_1.refunds = [{ status: "DONE", value: 100 }];
  await deliver("evt_3", "PAYMENT_PARTIALLY_REFUNDED", "pay_1");
  assert.equal(receipt("p1").paid, true);
  assert.equal(tables.payment_transactions.find((t) => t.provider_payment_id === "pay_1")!.refunded_cents, 10000);
  remote.pay_1.status = "REFUNDED";
  remote.pay_1.refunds = [{ status: "DONE", value: 700 }];
  await deliver("evt_4", "PAYMENT_REFUNDED", "pay_1");
  assert.equal(receipt("p1").paid, false);
  assert.match(String(receipt("p1").notes), /Estornado via Asaas/);
  assert.equal(tables.payment_transactions.find((t) => t.provider_payment_id === "pay_1")!.status, "refunded");
  // Evento PAYMENT_RECEIVED antigo reenviado depois do estorno não quita de novo (GET diz REFUNDED)
  await deliver("evt_2b", "PAYMENT_RECEIVED", "pay_1");
  assert.equal(receipt("p1").paid, false);

  // 5. Chargeback: estado próprio, parcela segue paga (não vira "não pago")
  const tx2 = tables.payment_transactions.find((t) => t.provider_payment_id === "pay_2")!;
  remote.pay_2.status = "RECEIVED";
  await deliver("evt_5", "PAYMENT_RECEIVED", "pay_2");
  assert.equal(receipt("p2").paid, true);
  remote.pay_2.status = "CHARGEBACK_REQUESTED";
  remote.pay_2.chargeback = { status: "REQUESTED" };
  await deliver("evt_6", "PAYMENT_CHARGEBACK_REQUESTED", "pay_2");
  assert.equal(tables.payment_transactions.find((t) => t.id === tx2.id)!.status, "chargeback");
  assert.equal(tables.payment_transactions.find((t) => t.id === tx2.id)!.chargeback_status, "REQUESTED");
  assert.equal(receipt("p2").paid, true);

  // 6. Vencida (PAYMENT_OVERDUE): continua aberta com status do provider
  const r3 = await s.createCharge(db, cfg, { rentalId: "r1", receiptId: "p3", billingType: "BOLETO", actor });
  remote[r3.tx.provider_payment_id!].status = "OVERDUE";
  await deliver("evt_7", "PAYMENT_OVERDUE", r3.tx.provider_payment_id!);
  const tx3 = tables.payment_transactions.find((t) => t.id === r3.tx.id)!;
  assert.equal(tx3.status, "link_created");
  assert.equal(tx3.provider_status, "OVERDUE");
  // Cancelamento: remove no Asaas e marca cancelada; parcela continua em aberto
  await s.cancelCharge(db, cfg, await s.loadTx(db, r3.tx.id), { id: "u1" });
  assert.equal(tables.payment_transactions.find((t) => t.id === r3.tx.id)!.status, "cancelled");
  assert.ok(remote[r3.tx.provider_payment_id!].deleted);
  assert.equal(receipt("p3").paid, false);

  // 7. Timeout na criação mas cobrança criada no Asaas: encontra por externalReference, não duplica
  tables.rentals[0].receipts = [...(tables.rentals[0].receipts as Row[]), { id: "p4", dueDate: future, amount: 350, paid: false }, { id: "p5", dueDate: future, amount: 350, paid: false }];
  failNextCreate = "timeout-but-created";
  const before = created;
  const r4 = await s.createCharge(db, cfg, { rentalId: "r1", receiptId: "p4", billingType: "PIX", actor });
  assert.equal(created, before + 1);
  assert.equal(r4.tx.status, "link_created");
  // Timeout sem criação: fica "started" (bloqueia repetição cega) até conciliar; conciliar libera nova tentativa
  failNextCreate = "timeout-not-created";
  await assert.rejects(s.createCharge(db, cfg, { rentalId: "r1", receiptId: "p5", billingType: "PIX", actor }), /Atualizar status/);
  await assert.rejects(s.createCharge(db, cfg, { rentalId: "r1", receiptId: "p5", billingType: "PIX", actor }), /sendo gerada/);
  const stuck = tables.payment_transactions.find((t) => t.receipt_id === "p5")!;
  await s.reconcileTx(db, cfg, await s.loadTx(db, stuck.id), { type: "staff", id: "u1" });
  assert.equal(tables.payment_transactions.find((t) => t.id === stuck.id)!.status, "failed");
  const r5 = await s.createCharge(db, cfg, { rentalId: "r1", receiptId: "p5", billingType: "PIX", actor });
  assert.equal(r5.tx.status, "link_created");

  // 8. Integração desativada: não cria novas, mas webhook de cobrança antiga ainda dá baixa
  tables.asaas_config[0].enabled = false;
  const off = (await s.loadAsaasConfig(db))!;
  tables.rentals[0].receipts = [...(tables.rentals[0].receipts as Row[]), { id: "p6", dueDate: future, amount: 100, paid: false }];
  await assert.rejects(s.createCharge(db, off, { rentalId: "r1", receiptId: "p6", billingType: "PIX", actor }), /desativada/);
  remote[r5.tx.provider_payment_id!].status = "RECEIVED";
  await deliver("evt_8", "PAYMENT_RECEIVED", r5.tx.provider_payment_id!);
  assert.equal(receipt("p5").paid, true);
  // PAYMENT_DELETED de cobrança já paga (evento tardio/inconsistente) não desfaz o pagamento
  remote[r5.tx.provider_payment_id!].deleted = true;
  await deliver("evt_8b", "PAYMENT_DELETED", r5.tx.provider_payment_id!);
  assert.equal(receipt("p5").paid, true);
  assert.equal(tables.payment_transactions.find((t) => t.id === r5.tx.id)!.status, "paid");

  // 9. Evento desconhecido / de cobrança alheia: registrado e ignorado sem erro
  remote.pay_x = { id: "pay_x", status: "RECEIVED", externalReference: "outro-sistema" };
  await deliver("evt_9", "PAYMENT_RECEIVED", "pay_x");
  assert.equal(tables.asaas_webhook_events.find((e) => e.id === "evt_9")!.status, "ignored");
  await (db as { from: (t: string) => Q }).from("asaas_webhook_events").insert({ id: "evt_10", environment: "sandbox", event: "TRANSFER_DONE", payload: { id: "evt_10", event: "TRANSFER_DONE", transfer: {} } });
  await wh.processEvent(db, "evt_10");
  assert.equal(tables.asaas_webhook_events.find((e) => e.id === "evt_10")!.status, "ignored");

  // 9b. Cancelamento automático: parcela paga por outro meio encerra a cobrança Asaas aberta
  tables.asaas_config[0].enabled = true;
  const on = (await s.loadAsaasConfig(db))!;
  tables.rentals[0].receipts = [...(tables.rentals[0].receipts as Row[]), { id: "p7", dueDate: future, amount: 200, paid: false }];
  const r7 = await s.createCharge(db, on, { rentalId: "r1", receiptId: "p7", billingType: "PIX", actor });
  // parcela ainda aberta: não cancela (navegador não consegue forçar)
  assert.equal(await s.releaseChargeIfSettled(db, "r1", "p7", { type: "staff", id: "u1" }, "baixa manual"), "open");
  assert.equal(tables.payment_transactions.find((t) => t.id === r7.tx.id)!.status, "link_created");
  receipt("p7").paid = true; // baixa manual / comprovante / InfinitePay
  assert.equal(await s.releaseChargeIfSettled(db, "r1", "p7", { type: "staff", id: "u1" }, "baixa manual"), "cancelled");
  assert.equal(tables.payment_transactions.find((t) => t.id === r7.tx.id)!.status, "cancelled");
  assert.ok(remote[r7.tx.provider_payment_id!].deleted);
  assert.equal(receipt("p7").paid, true, "baixa manual preservada");
  assert.equal(await s.releaseChargeIfSettled(db, "r1", "p7", { type: "staff", id: "u1" }, "baixa manual"), "none", "idempotente");
  // Cliente já pagou no Asaas antes do cancelamento: não cancela, reconcilia (duplicidade fica registrada)
  tables.rentals[0].receipts = [...(tables.rentals[0].receipts as Row[]), { id: "p8", dueDate: future, amount: 200, paid: false }];
  const r8 = await s.createCharge(db, on, { rentalId: "r1", receiptId: "p8", billingType: "PIX", actor });
  receipt("p8").paid = true;
  remote[r8.tx.provider_payment_id!].status = "RECEIVED";
  const res8 = await s.releaseChargeIfSettled(db, "r1", "p8", { type: "staff", id: "u1" }, "baixa manual");
  assert.notEqual(res8, "cancelled");
  assert.ok(!remote[r8.tx.provider_payment_id!].deleted);
  // Asaas fora do ar: não lança, registra erro na tentativa
  tables.rentals[0].receipts = [...(tables.rentals[0].receipts as Row[]), { id: "p9", dueDate: future, amount: 200, paid: false }];
  const r9 = await s.createCharge(db, on, { rentalId: "r1", receiptId: "p9", billingType: "PIX", actor });
  receipt("p9").cancelled = true;
  const saved = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 503 })) as typeof fetch;
  assert.equal(await s.releaseChargeIfSettled(db, "r1", "p9", { type: "staff", id: "u1" }, "parcela cancelada"), "error");
  globalThis.fetch = saved;
  assert.match(String(tables.payment_transactions.find((t) => t.id === r9.tx.id)!.last_error), /não foi cancelada/);

  // 10. Pix: QR vem do endpoint oficial da cobrança
  const qr = await s.pixQrCode(cfg, await s.loadTx(db, r4.tx.id));
  assert.ok(qr.image?.startsWith("data:image/png;base64,") && qr.payload);
  assert.ok(calls.some((c) => c.endsWith(`/payments/${r4.tx.provider_payment_id}/pixQrCode`)));

  console.log("✓ asaas fluxo ok: cobrança única, baixa única, duplicado/fora de ordem, estorno, chargeback, vencida, cancelamento, timeout, desativada, cancelamento automático");

})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
