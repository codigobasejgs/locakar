// Copiloto WhatsApp: parser, guard (self-chat/anti-invasão/autorização), níveis, fluxos sem IA e IA → mesmo card.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handle, render, type Claim, type FlowData, type FlowPorts, type PendingType, type Session } from "../src/lib/copilot/flow";
import { allowed, guard } from "../src/lib/copilot/guard";
import { isMenuCommand, parseAmount, parseMessage } from "../src/lib/copilot/parse";
import type { FleetVehicle, Rental } from "../src/types";

// ---------- Parser ----------
assert.deepEqual(parseMessage({ buttonsResponseMessage: { selectedButtonId: "confirm_action:1" } }), { kind: "action", id: "confirm_action:1" });
assert.deepEqual(parseMessage({ templateButtonReplyMessage: { selectedId: "menu" } }), { kind: "action", id: "menu" });
assert.deepEqual(parseMessage({ listResponseMessage: { singleSelectReply: { selectedRowId: "pay:r1|r1-r1" } } }), { kind: "action", id: "pay:r1|r1-r1" });
assert.deepEqual(parseMessage({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"id":"m:fin"}' } } }), { kind: "action", id: "m:fin" });
assert.deepEqual(parseMessage({ ephemeralMessage: { message: { conversation: " menu " } } }), { kind: "text", text: "menu" });
assert.deepEqual(parseMessage({ extendedTextMessage: { text: "2" } }, ["confirm_action:x", "cancel_action:x"]), { kind: "action", id: "cancel_action:x" }, "número digitado vira o botão");
assert.deepEqual(parseMessage({ extendedTextMessage: { text: "7" } }, ["a"]), { kind: "text", text: "7" });
assert.equal(parseMessage({ audioMessage: { mimetype: "audio/ogg" } }).kind, "audio");
assert.equal(parseMessage({ documentMessage: { mimetype: "application/pdf" } }).kind, "document");
assert.equal(parseMessage({ protocolMessage: {} }).kind, "ignored");
assert.deepEqual(parseAmount("180 Pneu traseiro"), { amount: 180, description: "Pneu traseiro" });
assert.deepEqual(parseAmount("R$ 1.250,50 troca de óleo"), { amount: 1250.5, description: "troca de óleo" });
assert.deepEqual(parseAmount("350,5"), { amount: 350.5, description: "" });
assert.equal(parseAmount("pneu"), null);
assert.equal(parseAmount("0"), null);
assert.ok(isMenuCommand("/menu") && isMenuCommand("#locakar") && isMenuCommand("Painel") && !isMenuCommand("menu de hoje"));

// ---------- Guard: self-chat, anti-invasão, gestores ----------
const me = { id: "5519988887777:12@s.whatsapp.net", lid: "123456789@lid" };
const admins = ["5511912345678"];
assert.deepEqual(guard({ remoteJid: "5519988887777@s.whatsapp.net", fromMe: true, id: "a" }, me, admins), { ok: true, who: "self", phone: "5519988887777", replyTo: "5519988887777@s.whatsapp.net" });
assert.equal(guard({ remoteJid: "123456789@lid", fromMe: true }, me, admins).ok, true, "self-chat por LID");
assert.equal(guard({ remoteJid: "5511900001111@s.whatsapp.net", fromMe: true }, me, admins).ok, false, "dono falando com cliente: ignorado");
assert.equal(guard({ remoteJid: "5511912345678@s.whatsapp.net", fromMe: true }, me, admins).ok, false, "dono falando com gestor: ignorado (não é comando)");
assert.equal(guard({ remoteJid: "5511912345678@s.whatsapp.net", fromMe: false }, me, admins).ok, true, "gestor autorizado");
assert.equal(guard({ remoteJid: "551112345678@s.whatsapp.net", fromMe: false }, me, admins).ok, true, "gestor sem o 9º dígito");
assert.equal(guard({ remoteJid: "5511900001111@s.whatsapp.net", fromMe: false }, me, admins).ok, false, "número não autorizado");
assert.equal(guard({ remoteJid: "999@lid", fromMe: false }, me, admins).ok, false, "só LID sem número: recusa");
assert.equal(guard({ remoteJid: "999@lid", fromMe: false, senderPn: "5511912345678@s.whatsapp.net" }, me, admins).ok, true, "LID com senderPn autorizado");
assert.equal(guard({ remoteJid: "120363@g.us", fromMe: false, participant: "5511912345678@s.whatsapp.net" }, me, admins).ok, false, "grupo ignorado");

// ---------- Níveis ----------
const L = (level: number, mode: "buttons" | "hybrid" = "hybrid", aiAvailable = true) => ({ level, mode, aiAvailable });
assert.ok(!allowed(L(1), "write") && allowed(L(2), "write"));
assert.ok(!allowed(L(2), "media") && allowed(L(3), "media") && !allowed(L(3, "buttons"), "media") && !allowed(L(3, "hybrid", false), "media"));
assert.ok(!allowed(L(3, "buttons"), "ai_text"));

// ---------- HMAC do webhook (mesma regra de src/lib/server/whaileys.ts, sem server-only) ----------
{
  const secret = "s".repeat(40), raw = '{"a":1}', ts = String(Date.now());
  const sig = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  const verify = (r: string, t: string, s: string, now = Date.now()) => /^\d{13}$/.test(t) && Math.abs(now - Number(t)) <= 300_000 && createHmac("sha256", secret).update(`${t}.${r}`).digest("hex") === s;
  assert.ok(verify(raw, ts, sig));
  assert.ok(!verify('{"a":2}', ts, sig), "corpo adulterado");
  assert.ok(!verify(raw, ts, sig, Date.now() + 600_000), "replay fora da janela");
}

// ---------- Fluxos com AI_ENABLED=false (porta sem ai) ----------
const today = "2026-11-13";
const vehicle = (id: string, plate: string, extra: Partial<FleetVehicle> = {}) => ({ id, plate, name: plate, brand: "Fiat", model: "Mobi", year: 2024, image: "", category: "Hatch", transmission: "Manual", fuel: "Flex", seats: 5, status: "rented", vehicleType: "Carro", odometer: 10000, ipvaStatus: "paid", licensingStatus: "paid", ...extra }) as unknown as FleetVehicle;
const rental: Rental = { id: "r1", clientId: "c1", vehicleId: "v1", contractType: "Semanal", startDate: "2026-11-01", endDate: "2026-12-01", weeklyRate: 360, status: "active",
  receipts: [{ id: "r1-r1", dueDate: "2026-11-06", amount: 360, paid: false }, { id: "r1-r2", dueDate: today, amount: 360, paid: false }, { id: "r1-r3", dueDate: "2026-11-20", amount: 360, paid: false }] };
const fixture = (): FlowData => ({
  vehicles: [vehicle("v1", "ABC1D23"), vehicle("v2", "XYZ9K88", { status: "available", model: "Pop 110i", odometer: 5000 })],
  clients: [{ id: "c1", code: 1, registeredAt: today, name: "João Silva", phone: "11999999999", cpf: "52998224725" }],
  rentals: [rental], reservations: [], expenses: [], maintenance: [{ id: "m1", date: "2026-11-01", vehicleId: "v2", description: "Freios", status: "pending" }], fines: [],
});

function ports() {
  const pending = new Map<string, { type: PendingType; payload: Record<string, unknown>; status: string }>();
  const executed: { type: PendingType; payload: Record<string, unknown> }[] = [];
  let n = 0;
  const p: FlowPorts = {
    data: async () => fixture(),
    createPending: async (type, payload) => { const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; pending.set(id, { type, payload, status: "PENDING" }); return id; },
    claim: async (id, decision): Promise<Claim> => {
      const a = pending.get(id);
      if (!a) return { result: "not_found" };
      if (a.status !== "PENDING") return { result: "already", status: a.status };
      a.status = decision;
      return { result: "claimed", type: a.type, payload: a.payload };
    },
    execute: async (type, payload) => { executed.push({ type, payload }); return `OK ${type}`; },
    notifyClient: async () => "enviado",
  };
  return { p, pending, executed };
}
const cfg = (level = 2, mode: "buttons" | "hybrid" = "buttons") => ({ level, mode, aiAvailable: false, orgName: "Locadora Teste" });

async function chat(steps: (string | { id: string })[], level = 2) {
  const { p, executed, pending } = ports();
  let session: Session = { step: "menu", data: {} };
  const outs = [];
  for (const s of steps) {
    const ev = typeof s === "string" ? parseMessage({ conversation: s }, (session.data.opts as string[]) ?? []) : { kind: "action" as const, id: s.id };
    const r = await handle(ev, session, cfg(level), p, today);
    session = r.session;
    outs.push(r.replies);
  }
  return { outs, executed, pending, session };
}
const lastIds = (outs: Awaited<ReturnType<typeof chat>>["outs"]) => render(outs.at(-1)!.at(-1)!).options.map((o) => o.id);

(async () => {
  // Menu com resumo do dia, direto do banco.
  {
    const { outs } = await chat(["menu"]);
    const t = outs[0][0].text;
    assert.match(t, /PAINEL — Locadora Teste/);
    assert.match(t, /Em aberto hoje: R\$\s?360,00/);
    assert.match(t, /Inadimplentes: 1/);
    assert.match(t, /Manutenções abertas: 1/);
    assert.ok(render(outs[0][0]).text.includes("1. 💰 Cobranças"), "opções numeradas no texto");
  }
  // Baixa integral pelo número digitado + clique duplo.
  {
    const r = await chat(["menu", "1", { id: "ch:late" }]);
    const pay = lastIds(r.outs)[0];
    assert.equal(pay, "pay:r1|r1-r1");
    const r2 = await chat(["menu", { id: pay }, { id: "settle_full:r1|r1-r1" }]);
    const confirm = lastIds(r2.outs)[0];
    assert.match(confirm, /^confirm_action:/);
    assert.match(r2.outs.at(-1)![0].text, /Valor recebido: R\$\s?360,00/);
    const { p, executed } = ports();
    await p.createPending("settle_receipt", { rentalId: "r1", receiptId: "r1-r1", amount: 360 });
    const id = "00000000-0000-4000-8000-000000000001";
    const first = await handle({ kind: "action", id: `confirm_action:${id}` }, { step: "menu", data: {} }, cfg(), p, today);
    const second = await handle({ kind: "action", id: `confirm_action:${id}` }, { step: "menu", data: {} }, cfg(), p, today);
    assert.equal(executed.length, 1, "clique duplo executa uma vez");
    assert.match(first.replies[0].text, /OK settle_receipt/);
    assert.match(second.replies[0].text, /já foi processada/);
  }
  // Cancelar não executa.
  {
    const { p, executed } = ports();
    await p.createPending("create_expense", { amount: 1 });
    const r = await handle({ kind: "action", id: "cancel_action:00000000-0000-4000-8000-000000000001" }, { step: "menu", data: {} }, cfg(), p, today);
    assert.match(r.replies[0].text, /Cancelado/);
    assert.equal(executed.length, 0);
  }
  // Despesa guiada: veículo → categoria → "180 Pneu traseiro" → card.
  {
    const r = await chat([{ id: "m:exp" }, { id: "exp_v:v1" }, { id: "exp_c:Pneu/Óleo" }, "180 Pneu traseiro"]);
    const card = r.outs.at(-1)![0];
    assert.match(card.text, /ABC1D23/);
    assert.match(card.text, /R\$\s?180,00/);
    const [pend] = [...r.pending.values()];
    assert.deepEqual([pend.type, pend.payload.amount, pend.payload.vehicleId, pend.payload.description], ["create_expense", 180, "v1", "Pneu/Óleo — Pneu traseiro"]);
  }
  // Manutenção guiada: veículo → KM → descrição/valor → card (KM maior atualiza hodômetro).
  {
    const r = await chat([{ id: "m:mnt" }, { id: "mnt:new" }, { id: "mnt_v:v2" }, "5.800", "245 Óleo, filtro e mão de obra"]);
    const [pend] = [...r.pending.values()];
    assert.deepEqual([pend.type, pend.payload.vehicleId, pend.payload.km, pend.payload.amount], ["create_maintenance", "v2", 5800, 245]);
    assert.match(r.outs.at(-1)![0].text, /atualiza hodômetro/);
  }
  // Relatório por período, sem IA.
  {
    const r = await chat([{ id: "m:fin" }, { id: "fin:this_year" }]);
    assert.match(r.outs.at(-1)![0].text, /Resumo financeiro — Este ano/);
    assert.match(r.outs.at(-1)![0].text, /Lucro líquido/);
  }
  // Frota → veículo alugado mostra locatário.
  {
    const r = await chat([{ id: "fleet:rented" }, { id: "veh:v1" }]);
    assert.match(r.outs.at(-1)![0].text, /Locatário: João Silva/);
  }
  // Nível 1: sem botões de escrita e confirmação forçada recusada.
  {
    const r = await chat(["menu"], 1);
    assert.ok(!lastIds(r.outs).includes("m:exp"), "nível 1 não oferece despesa");
    const forced = await chat([{ id: "settle_full:r1|r1-r1" }], 1);
    assert.match(forced.outs[0][0].text, /somente leitura|bloquead/);
    assert.equal(forced.pending.size, 0);
    const confirm = await chat([{ id: "confirm_action:00000000-0000-4000-8000-000000000001" }], 1);
    assert.match(confirm.outs[0][0].text, /bloqueada/);
  }
  // Sem IA: texto livre e mídia não chamam IA.
  {
    const r = await chat(["recebi 360 do joão"]);
    assert.match(r.outs[0][0].text, /Não entendi/);
    const { p } = ports();
    const m = await handle({ kind: "audio" }, { step: "menu", data: {} }, cfg(3, "hybrid"), p, today, { mimetype: "audio/ogg", data: "x" });
    assert.match(m.replies[0].text, /Nível 3/);
  }
  // Híbrido: IA (stub) só preenche o payload → mesmo card de confirmação.
  {
    const { p, pending } = ports();
    let calls = 0;
    p.ai = async () => { calls++; return { intent: "maintenance", plate: "XYZ-9K88", km: 6000, amount: 245, description: "1x Óleo R$ 45; Mão de obra R$ 80", supplier: "Oficina Boa" }; };
    const r = await handle({ kind: "image", mimetype: "image/jpeg" }, { step: "menu", data: {} }, { ...cfg(3, "hybrid"), aiAvailable: true }, p, today, { mimetype: "image/jpeg", data: "eA==" });
    assert.equal(calls, 1);
    assert.match(r.replies[0].text, /Oficina Boa/);
    assert.match(render(r.replies[0]).options[0].id, /^confirm_action:/);
    assert.equal([...pending.values()][0].payload.vehicleId, "v2");
    // Placa inexistente vinda da IA não vira lançamento.
    p.ai = async () => ({ intent: "expense", plate: "ZZZ0Z00", amount: 90, description: "óleo" });
    const bad = await handle({ kind: "text", text: "gastei 90 de óleo na ZZZ0Z00" }, { step: "menu", data: {} }, { ...cfg(2, "hybrid"), aiAvailable: true }, p, today);
    assert.match(bad.replies[0].text, /não encontrada/);
    // Botões continuam sem IA no híbrido.
    calls = 0;
    await handle({ kind: "action", id: "m:fin" }, { step: "menu", data: {} }, { ...cfg(3, "hybrid"), aiAvailable: true }, p, today);
    assert.equal(calls, 0, "clique em botão nunca chama IA");
  }
  console.log("✓ copilot ok");
})().catch((e) => { console.error(e); process.exit(1); });
