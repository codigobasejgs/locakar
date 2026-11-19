import "server-only";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { handle, render, type FlowData, type FlowPorts, type PendingType, type Reply, type Session } from "@/lib/copilot/flow";
import { allowed, type GuardResult } from "@/lib/copilot/guard";
import type { CopilotEvent } from "@/lib/copilot/parse";
import { releaseChargeIfSettled } from "@/lib/server/asaas";
import { sendCharge } from "@/lib/server/charge";
import { brand, requireOrg } from "@/lib/server/org-context";
import { serviceDb } from "@/lib/server/push";
import { audit } from "@/lib/server/tenant";
import { formatCurrency, todaySP } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import { mergeSettings } from "@/repositories/types";
import type { Client, CompanySettings, FleetVehicle, Rental } from "@/types";
import { interpret, copilotAiKey } from "./copilot-ai";
import { hasPlanFeature } from "./plan";
import { instanceKeyFor, whaileysSend, type OutgoingCard } from "./whaileys";

export interface CopilotConfig {
  organization_id: string; enabled: boolean; mode: "buttons" | "hybrid"; level: number; admin_phones: string[]; instance_key: string;
  connected_jid: string | null; connected_lid: string | null;
  /** Autoatendimento do locatário (migration 20261024). Ausente = desligado. */
  customer_bot_enabled?: boolean; charge_buttons_enabled?: boolean; customer_rate_per_hour?: number;
}

export async function loadCopilotConfig(): Promise<CopilotConfig> {
  const org = requireOrg().org.id;
  const db = serviceDb();
  const { data, error } = await db.from("copilot_config").select("*").maybeSingle();
  if (error) throw new Error("Aplique a migration 20261023000000_copilot.sql.");
  if (data) return data as CopilotConfig;
  const fresh = { enabled: false, mode: "hybrid", level: 1, admin_phones: [], instance_key: instanceKeyFor(org) };
  await db.from("copilot_config").upsert(fresh, { onConflict: "organization_id", ignoreDuplicates: true });
  return { organization_id: org, connected_jid: null, connected_lid: null, ...fresh } as CopilotConfig;
}

async function loadData(): Promise<FlowData> {
  const db = serviceDb();
  const tables = ["vehicles", "clients", "rentals", "reservations", "expenses", "maintenance", "fines"] as const;
  const rows = await Promise.all(tables.map(async (t) => {
    const { data, error } = await db.from(t).select("*");
    if (error) throw new Error(`${t}: ${error.message}`);
    return [t, (data ?? []).map((r) => fromRow(r))] as const;
  }));
  return Object.fromEntries(rows) as unknown as FlowData;
}

async function loadSettings(): Promise<CompanySettings> {
  const { data } = await serviceDb().from("settings").select("data").maybeSingle();
  return mergeSettings(DEFAULT_SETTINGS, data?.data as Partial<CompanySettings> | undefined);
}

/** Efeito real de uma ação confirmada (já reivindicada no banco: executa uma única vez). */
async function execute(type: PendingType, p: Record<string, unknown>, actionId: string, phone: string): Promise<string> {
  const db = serviceDb();
  const orgId = requireOrg().org.id;
  const today = todaySP();
  const actor = { actorType: "staff" as const, actorId: null, details: { via: "copilot_whatsapp", phone, actionId } };
  if (type === "settle_receipt") {
    const { data: r, error } = await db.rpc("settle_rental_receipt", { p_org: orgId, p_rental: p.rentalId, p_receipt: p.receiptId, p_amount: p.amount, p_method: "Baixa via Copiloto WhatsApp", p_by: "Copiloto WhatsApp", p_paid_at: today });
    if (error) throw new Error("Não foi possível dar baixa agora.");
    if (r === "already") return "ℹ️ Esta parcela já constava como paga. Nada foi alterado.";
    if (r === "cancelled") return "Esta parcela foi cancelada e não pode receber baixa.";
    if (r !== "settled") return "Parcela não encontrada.";
    await releaseChargeIfSettled(db, String(p.rentalId), String(p.receiptId), { type: "system" }, "Baixa via Copiloto WhatsApp");
    await audit({ ...actor, action: "copilot.receipt_settled", entity: "rentals", entityId: String(p.rentalId), details: { ...actor.details, receiptId: p.receiptId, amount: p.amount } });
    return `✅ Baixa realizada! A parcela de ${p.label} consta como paga (${formatCurrency(Number(p.amount))}).`;
  }
  if (type === "create_expense") {
    const { error } = await db.from("expenses").upsert({ id: `copilot-${actionId}`, date: today, description: String(p.description), vehicle_id: p.vehicleId ?? null, amount: p.amount, paid: true, payment_method: null, category: "misc", notes: "Lançada pelo Copiloto WhatsApp" }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error("Não foi possível gravar a despesa.");
    await audit({ ...actor, action: "copilot.expense_created", entity: "expenses", entityId: `copilot-${actionId}`, details: { ...actor.details, amount: p.amount } });
    const { data: open } = await db.from("expenses").select("amount,date").eq("paid", false);
    const late = (open ?? []).filter((e) => e.date < today).reduce((s, e) => s + Number(e.amount), 0);
    const upcoming = (open ?? []).filter((e) => e.date >= today).reduce((s, e) => s + Number(e.amount), 0);
    return `✅ Despesa cadastrada (${formatCurrency(Number(p.amount))}).\n• Já vencidas: ${formatCurrency(late)}\n• A vencer: ${formatCurrency(upcoming)}`;
  }
  const km = typeof p.km === "number" ? p.km : null;
  const { error } = await db.from("maintenance").upsert({ id: `copilot-${actionId}`, date: today, vehicle_id: p.vehicleId, description: String(p.description), current_km: km, supplier: p.supplier ?? null, amount: p.amount, status: "done", notes: "Lançada pelo Copiloto WhatsApp" }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("Não foi possível gravar a manutenção.");
  let odo = "";
  if (km) {
    // Hodômetro nunca regride: só atualiza se o KM da nota for maior que o atual.
    const { data: up } = await db.from("vehicles").update({ odometer: km }).eq("id", String(p.vehicleId)).or(`odometer.is.null,odometer.lt.${km}`).select("id");
    odo = up?.length ? `\n📍 Hodômetro atualizado para ${km.toLocaleString("pt-BR")} km.` : "\n📍 Hodômetro mantido (KM informado não é maior que o atual).";
  }
  await audit({ ...actor, action: "copilot.maintenance_created", entity: "maintenance", entityId: `copilot-${actionId}`, details: { ...actor.details, amount: p.amount, km } });
  return `✅ Manutenção cadastrada (${formatCurrency(Number(p.amount))}).${odo}\nO custo já aparece no Financeiro.`;
}

async function notifyClient(rentalId: string, receiptId: string) {
  const db = serviceDb();
  const { data: row } = await db.from("rentals").select("*").eq("id", rentalId).maybeSingle();
  if (!row) return "Locação não encontrada.";
  const rental = fromRow<Rental>(row);
  const receipt = rental.receipts.find((r) => r.id === receiptId);
  if (!receipt || receipt.paid || receipt.cancelled) return "Parcela não está em aberto.";
  const [{ data: c }, { data: v }] = await Promise.all([db.from("clients").select("*").eq("id", rental.clientId).maybeSingle(), db.from("vehicles").select("*").eq("id", rental.vehicleId).maybeSingle()]);
  if (!c) return "Cliente não encontrado.";
  try {
    const sent = await sendCharge(db, { rental, receipt, client: fromRow<Client>(c), vehicle: v ? fromRow<FleetVehicle>(v) : undefined, settings: await loadSettings(), today: todaySP() });
    return `📲 Cobrança enviada ao cliente${Array.isArray(sent) ? ` (${sent.join(", ")})` : ""}.`;
  } catch (e) {
    return `Não foi possível enviar a cobrança: ${(e as Error).message}`;
  }
}

/** Resposta do fluxo → card do Whaileys (lista ou até 3 botões; texto numerado sempre presente). */
export function toCard(r: Reply): OutgoingCard {
  const { text } = render(r);
  if (r.list) return { text, buttonText: r.list.button, sections: [{ title: "Opções", rows: r.list.rows }] };
  if (r.buttons?.length && r.buttons.length <= 3) return { text, buttons: r.buttons };
  return { text };
}

/**
 * Processa um evento autorizado: sessão → fluxo → respostas. `transport` envia (webhook) ou captura (simulador).
 * dryRun: confirmação não grava nada.
 */
export async function runCopilot(
  ev: CopilotEvent,
  who: Extract<GuardResult, { ok: true }>,
  opts: { media?: { mimetype: string; data: string }; dryRun?: boolean; session?: Session; transport: (card: OutgoingCard) => Promise<void> },
) {
  const db = serviceDb();
  const cfg = await loadCopilotConfig();
  // IA (áudio, foto, PDF, texto livre) só no plano com ai_copilot; sem ela o Copiloto segue em botões.
  const ai = cfg.mode === "hybrid" && (await hasPlanFeature(requireOrg().org.id, "ai_copilot")) ? await copilotAiKey() : null;
  const flowCfg = { level: cfg.level, mode: cfg.mode, aiAvailable: Boolean(ai), orgName: brand().name };
  const orgId = requireOrg().org.id;

  const { data: s } = opts.dryRun ? { data: null } : await db.from("copilot_sessions").select("step,data,expires_at").eq("phone", who.phone).maybeSingle();
  const session: Session = opts.session ?? (s && new Date(s.expires_at as string) > new Date() ? { step: s.step as string, data: (s.data as Record<string, unknown>) ?? {} } : { step: "menu", data: {} });

  const ports: FlowPorts = {
    data: loadData,
    createPending: async (type, payload) => {
      const id = randomUUID();
      if (opts.dryRun) return id;
      const { error } = await db.from("copilot_pending_actions").insert({ id, admin_phone: who.phone, action_type: type, payload });
      if (error) throw new Error("Não foi possível preparar a confirmação.");
      return id;
    },
    claim: async (id, decision) => {
      if (opts.dryRun) return decision === "CONFIRMED" ? { result: "already", status: "SIMULATION" } : { result: "claimed", type: "create_expense", payload: {} };
      if (!/^[0-9a-f-]{36}$/.test(id)) return { result: "not_found" };
      const { data, error } = await db.rpc("claim_copilot_action", { p_org: orgId, p_id: id, p_phone: who.phone, p_decision: decision });
      if (error) throw new Error("Confirmação indisponível.");
      // id da ação vira chave idempotente de despesa/manutenção.
      return data?.payload ? { ...data, payload: { ...data.payload, __id: id } } : data;
    },
    execute: (type, payload) => execute(type, payload, String(payload.__id), who.phone),
    notifyClient: async (r, rc) => (opts.dryRun ? "Simulação: cobrança não enviada." : notifyClient(r, rc)),
    ...(ai ? { ai: (input) => interpret(input) } : {}),
  };

  let replies: Reply[];
  let next: Session;
  try {
    ({ replies, session: next } = await handle(ev, session, flowCfg, ports, todaySP(), allowed(flowCfg, "media") ? opts.media : undefined));
  } catch (e) {
    replies = [{ text: `⚠️ ${(e as Error).message || "Não foi possível concluir."}`, buttons: [{ id: "menu", title: "🏠 Menu" }] }];
    next = { step: "menu", data: {} };
  }
  if (opts.dryRun && ev.kind === "action" && ev.id.startsWith("confirm_action:")) replies = [{ text: "🧪 Simulação: confirmação recebida. Nada foi gravado.", buttons: [{ id: "menu", title: "🏠 Menu" }] }];

  if (!opts.dryRun) await db.from("copilot_sessions").upsert({ phone: who.phone, step: next.step, data: next.data, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }, { onConflict: "organization_id,phone" });
  for (const r of replies) await opts.transport(toCard(r));
  return { replies: replies.map(toCard), session: next };
}

/** Envio real pelo motor + registro do id (anti-loop no lado do LocaKar). */
export function whaileysTransport(cfg: CopilotConfig, phone: string, to: string) {
  return async (card: OutgoingCard) => {
    const { messageId } = await whaileysSend(cfg.instance_key, to, card);
    await serviceDb().from("copilot_messages").insert({ phone, direction: "out", provider_id: messageId, kind: card.sections ? "list" : card.buttons ? "buttons" : "text", text: card.text.slice(0, 500) });
  };
}
