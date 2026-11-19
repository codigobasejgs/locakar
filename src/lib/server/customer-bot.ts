import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { billingOf, chargeFor, PERIOD_UNIT } from "@/lib/billing";
import { chargeButtons, handleCustomer, type CustomerConfig, type CustomerPorts, type CustomerSession, type OpenInstallment } from "@/lib/customer-bot/flow";
import { matchClients } from "@/lib/customer-bot/identify";
import type { CopilotEvent } from "@/lib/copilot/parse";
import { normalizeHandle } from "@/lib/infinitepay";
import { infinitePayState, pixState } from "@/lib/payment-methods";
import { bankSlipLine, createCharge, loadAsaasConfig, pixQrCode, readyForCharges } from "@/lib/server/asaas";
import { createReceiptCheckout } from "@/lib/server/infinitepay";
import { createGatewayLink } from "@/lib/server/gateways";
import { GATEWAY_IDS } from "@/lib/gateways";
import { getPaymentMethods, usable } from "@/lib/server/payment-methods";
import { brand, requireOrg, siteUrl } from "@/lib/server/org-context";
import { hasPlanFeature } from "@/lib/server/plan";
import { loadSettings, notifyStaff, serviceDb } from "@/lib/server/push";
import { signatureLink, signedFile } from "@/lib/server/signature/service";
import { SignatureError } from "@/lib/server/signature/types";
import { HttpError } from "@/lib/server/supabase";
import { audit } from "@/lib/server/tenant";
import { cancelReservation, createIncident, requestReservation, submitDocument } from "@/lib/server/tenant-actions";
import { daysBetween, formatCurrency, formatDate, todaySP, toWhatsAppNumber } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import type { Rental } from "@/types";
import { toCard, type CopilotConfig } from "./copilot";
import { isWhaileysEnabled, whaileysSend, whaileysStatus, type OutgoingCard } from "./whaileys";

/** Link do App Oficial da locadora (mesmo padrão da página pública /l/<slug>). */
export const appUrlFor = () => `${siteUrl()}/locatario?org=${brand().slug ?? ""}`;

const RECEIPT_MAX = 7 * 1024 * 1024;

/** Comprovante vindo do WhatsApp: mesmas regras do app (PDF/JPG/PNG até 7 MB, conferidos pelo conteúdo). */
export function proofKind(bytes: Buffer): "pdf" | "jpg" | "png" | null {
  if (bytes.length === 0 || bytes.length > RECEIPT_MAX) return null;
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "png";
  return null;
}

/**
 * Portas do autoatendimento. Toda consulta é da locadora (serviceDb) E do cliente identificado pelo telefone:
 * o client_id vem da sessão (resolvida pelo número), nunca do texto da mensagem.
 */
function ports(phone: string, dryRun: boolean): CustomerPorts {
  const db = serviceDb();
  const orgId = requireOrg().org.id;
  const ensureOwn = async (clientId: string, rentalId: string) => {
    const { data } = await db.from("rentals").select("id").eq("id", rentalId).eq("client_id", clientId).maybeSingle();
    if (!data) throw new HttpError(404, "Parcela não encontrada.");
  };
  return {
    async candidates() {
      // ponytail: lê os telefones da locadora e casa em memória (máscaras variadas no cadastro impedem filtro SQL exato).
      // Escala bem até alguns milhares de clientes; acima disso, gravar telefone normalizado em coluna indexada.
      const { data } = await db.from("clients").select("id,name,phone,backup_phone,cpf").limit(5000);
      return matchClients(phone, (data ?? []).map((c) => ({ id: c.id as string, name: c.name as string, phone: c.phone as string, backupPhone: c.backup_phone as string | null, cpf: c.cpf as string })));
    },
    async installments(clientId) {
      const { data } = await db.from("rentals").select("*").eq("client_id", clientId).neq("status", "cancelled");
      const settings = await loadSettings(db);
      const today = todaySP();
      const rentals = (data ?? []).map((r) => fromRow<Rental>(r));
      const plates = new Map<string, string>();
      if (rentals.length) {
        const { data: vs } = await db.from("vehicles").select("id,plate").in("id", [...new Set(rentals.map((r) => r.vehicleId))]);
        for (const v of vs ?? []) plates.set(v.id as string, v.plate as string);
      }
      const out: OpenInstallment[] = [];
      for (const r of rentals) {
        const unit = PERIOD_UNIT[billingOf(r).period];
        r.receipts.forEach((x, idx) => {
          if (x.paid || x.cancelled) return;
          // Valor do dia (multa/juros) calculado aqui, igual ao app: nunca vem da mensagem.
          const c = chargeFor(r, x.id, settings.pix, today);
          out.push({ rentalId: r.id, receiptId: x.id, label: `${unit} ${idx + 1}`, dueDate: x.dueDate, amount: x.amount, total: c?.total ?? x.amount, daysLate: Math.max(0, daysBetween(x.dueDate, today)), plate: plates.get(r.vehicleId) });
        });
      }
      return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    },
    async pin(clientId, ok) {
      if (dryRun) return ok ? "verified" : "wrong";
      // A função do banco exige a linha da sessão (contador e bloqueio ficam lá).
      await db.from("customer_bot_sessions").upsert({ phone, client_id: clientId }, { onConflict: "organization_id,phone", ignoreDuplicates: true });
      const { data, error } = await db.rpc("customer_bot_pin", { p_org: orgId, p_phone: phone, p_ok: ok });
      if (error) throw new Error("Verificação indisponível.");
      return data === "verified" ? "verified" : data === "locked" ? "locked" : "wrong";
    },
    async asaas(clientId, rentalId, receiptId, kind) {
      if (dryRun) return { pix: "000201SIMULACAO-PIX", invoiceUrl: "https://exemplo/fatura", line: "0000.0000 SIMULAÇÃO" };
      await ensureOwn(clientId, rentalId);
      const cfg = await loadAsaasConfig(db);
      if (!readyForCharges(cfg)) throw new HttpError(409, "Pagamento online indisponível no momento.");
      // createCharge confere de novo o dono (clientId) e reaproveita a cobrança aberta da parcela.
      const { tx } = await createCharge(db, cfg, { rentalId, receiptId, billingType: kind, clientId, actor: { type: "client", id: clientId, ip: null } });
      if (kind === "PIX") return { pix: (await pixQrCode(cfg, tx)).payload, invoiceUrl: tx.invoice_url ?? null };
      return { line: (await bankSlipLine(cfg, tx)).identificationField, invoiceUrl: tx.invoice_url ?? tx.bank_slip_url ?? null };
    },
    async infinitepay(clientId, rentalId, receiptId) {
      if (dryRun) return { url: "https://checkout.infinitepay.io/simulacao" };
      const ip = (await loadSettings(db)).infinitepay;
      const handle = normalizeHandle(ip?.handle ?? "");
      if (!infinitePayState(ip).checkout || !handle) throw new HttpError(409, "Pagamento com cartão indisponível no momento.");
      const r = await createReceiptCheckout(db, { handle, rentalId, receiptId, clientId, actor: { type: "client", id: clientId, ip: null } });
      return { url: r.url };
    },
    async gateway(clientId, provider, rentalId, receiptId) {
      if (dryRun) return { url: `https://exemplo/${provider}/simulacao` };
      const r = await createGatewayLink(db, provider, { rentalId, receiptId, clientId, actor: { type: "client", id: clientId, ip: null } });
      return { url: r.url };
    },
    async pixManual(clientId, rentalId, receiptId) {
      await ensureOwn(clientId, rentalId);
      const settings = await loadSettings(db);
      const { data: row } = await db.from("rentals").select("*").eq("id", rentalId).eq("client_id", clientId).single();
      const c = chargeFor(fromRow<Rental>(row), receiptId, settings.pix, todaySP());
      if (!c) throw new HttpError(404, "Parcela não encontrada.");
      return { code: c.code, key: settings.pix.key, name: settings.pix.name, amount: c.total };
    },
    async proof(clientId, rentalId, receiptId, media) {
      const bytes = Buffer.from(media.data, "base64");
      const kind = proofKind(bytes);
      if (!kind) throw new HttpError(422, "Envie o comprovante em PDF, JPG ou PNG de até 7 MB.");
      const { data: row } = await db.from("rentals").select("*").eq("id", rentalId).eq("client_id", clientId).maybeSingle();
      if (!row) throw new HttpError(404, "Parcela não encontrada.");
      const rental = fromRow<Rental>(row);
      const inst = rental.receipts.find((r) => r.id === receiptId);
      if (!inst) throw new HttpError(404, "Parcela não encontrada.");
      if (inst.paid) throw new HttpError(409, "Esta parcela já está paga.");
      if (inst.cancelled) throw new HttpError(409, "Esta parcela está cancelada.");
      const settings = await loadSettings(db);
      const amount = chargeFor(rental, receiptId, settings.pix, todaySP())?.total ?? inst.amount;
      if (dryRun) return { amount };
      // Mesma pasta, impressão digital e fila de aprovação do app (POST /api/tenant/receipts).
      const path = `${clientId}/whatsapp-${randomUUID()}.${kind}`;
      const { error: up } = await db.storage.from("comprovantes").upload(path, bytes, { contentType: kind === "pdf" ? "application/pdf" : `image/${kind === "jpg" ? "jpeg" : "png"}`, upsert: false });
      if (up) throw new HttpError(500, "Não foi possível guardar o comprovante.");
      const sha = createHash("sha256").update(bytes).digest("hex");
      const { data: created, error } = await db.from("payment_receipts").insert({ client_id: clientId, rental_id: rentalId, receipt_id: receiptId, amount, proof_url: path, proof_sha256: sha, status: "pending_review", payment_date: todaySP() }).select("id").single();
      if (error) {
        await db.storage.from("comprovantes").remove([path]);
        if (error.code === "23505") throw new HttpError(409, "Já existe um comprovante desta parcela em análise.");
        throw new HttpError(500, "Não foi possível registrar o comprovante.");
      }
      await audit({ actorType: "client", actorId: clientId, action: "payment_receipt.submitted", entity: "payment_receipts", entityId: created.id, details: { rentalId, receiptId, amount, via: "whatsapp" } });
      const { data: c } = await db.from("clients").select("name").eq("id", clientId).maybeSingle();
      await notifyStaff([{ type: "payment.receipt_submitted", category: "payments", severity: "warning", title: "Novo comprovante (WhatsApp)", body: `${c?.name ?? "Cliente"} · ${formatCurrency(amount)} · vencimento ${formatDate(inst.dueDate)}`, url: "/admin/finance", dedupeKey: `payment_receipt:${created.id}` }]);
      return { amount };
    },

    /* ---------- Etapa 2 ---------- */
    async rentals(clientId) {
      const { data } = await db.from("rentals").select("id,status,start_date,end_date,km_start,vehicle_id").eq("client_id", clientId).neq("status", "cancelled").order("start_date", { ascending: false }).limit(10);
      const rows = data ?? [];
      if (!rows.length) return [];
      const ids = rows.map((r) => r.id as string);
      const vehicleIds = [...new Set(rows.map((r) => r.vehicle_id as string))];
      const active = rows.filter((r) => ["active", "late", "pending"].includes(r.status as string)).map((r) => r.vehicle_id as string);
      const [vs, maint, fines, contracts] = await Promise.all([
        db.from("vehicles").select("id,name,plate,odometer").in("id", vehicleIds),
        // Igual à view do app: só do carro atual, sem custo nem fornecedor.
        active.length ? db.from("maintenance").select("vehicle_id,date,description,status").in("vehicle_id", active).order("date", { ascending: false }).limit(10) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        db.from("fines").select("vehicle_id,infraction_date,description,amount,status,due_date").eq("client_id", clientId).order("infraction_date", { ascending: false }).limit(20),
        db.from("contracts").select("rental_id,status,contract_signature_processes(id,status,created_at)").in("rental_id", ids).neq("status", "cancelled"),
      ]);
      const vehicle = new Map((vs.data ?? []).map((v) => [v.id as string, { name: v.name as string, plate: v.plate as string, odometer: (v.odometer as number | null) ?? null }]));
      const contractOf = new Map<string, { processId: string; status: string }>();
      for (const c of contracts.data ?? []) {
        const p = ((c.contract_signature_processes ?? []) as { id: string; status: string; created_at: string }[]).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (p && !contractOf.has(c.rental_id as string)) contractOf.set(c.rental_id as string, { processId: p.id, status: p.status });
      }
      return rows.map((r) => ({
        id: r.id as string,
        status: r.status as string,
        startDate: r.start_date as string,
        endDate: r.end_date as string,
        kmStart: (r.km_start as number | null) ?? null,
        vehicle: vehicle.get(r.vehicle_id as string) ?? null,
        maintenance: (maint.data ?? []).filter((m) => m.vehicle_id === r.vehicle_id).map((m) => ({ date: m.date as string, description: m.description as string, status: m.status as string })),
        fines: (fines.data ?? []).filter((f) => f.vehicle_id === r.vehicle_id).map((f) => ({ infractionDate: f.infraction_date as string, description: f.description as string, amount: Number(f.amount), status: f.status as string, dueDate: f.due_date as string })),
        contract: contractOf.get(r.id as string) ?? null,
      }));
    },
    async upload(clientId, bucket, media, folder) {
      const bytes = Buffer.from(media.data, "base64");
      const kind = proofKind(bytes);
      const okKind = kind === "jpg" || kind === "png" || (kind === "pdf" && bucket === "documentos");
      if (!okKind) throw new HttpError(422, bucket === "documentos" ? "Envie foto (JPG/PNG) ou PDF de até 7 MB." : "Envie uma foto (JPG/PNG) de até 7 MB.");
      if (dryRun) return `${clientId}/simulacao.${kind}`;
      let path: string;
      if (bucket === "vistorias") {
        // folder = <rentalId>/app/<requestId>/<slot>_<n>: mesmo caminho que o App usa (ele reaproveita estas fotos).
        if (!folder || !/^[A-Za-z0-9-]+\/app\/[A-Za-z0-9_-]{8,64}\/[a-z]+_\d+$/.test(folder)) throw new HttpError(422, "Vistoria inválida.");
        await ensureOwn(clientId, folder.split("/")[0]);
        path = `${folder}.jpg`;
      } else path = `${clientId}/whatsapp-${randomUUID()}.${kind}`;
      const contentType = kind === "pdf" ? "application/pdf" : kind === "png" ? "image/png" : "image/jpeg";
      const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType, upsert: bucket === "vistorias" });
      if (error) throw new HttpError(500, "Não foi possível guardar o arquivo. Tente de novo.");
      return path;
    },
    async incident(clientId, rentalId, category, description, photos, requestId) {
      if (dryRun) return { id: "simulacao" };
      return createIncident({ clientId, rentalId, category, description, photos, requestId, via: "whatsapp" });
    },
    async document(clientId, kind, path) {
      if (dryRun) return { id: "simulacao" };
      return submitDocument({ clientId, kind, path, via: "whatsapp" });
    },
    async contractLink(clientId, processId) {
      // Mesmo dono do app: processo → contrato → locação do cliente.
      const { data: p } = await db.from("contract_signature_processes").select("id,contract_id,status").eq("id", processId).maybeSingle();
      const { data: c } = p ? await db.from("contracts").select("rental_id").eq("id", p.contract_id).maybeSingle() : { data: null };
      const { data: r } = c ? await db.from("rentals").select("id").eq("id", c.rental_id).eq("client_id", clientId).maybeSingle() : { data: null };
      if (!p || !r) throw new HttpError(404, "Contrato não encontrado.");
      if (dryRun) return { url: "https://exemplo/contrato-simulacao" };
      try {
        return { url: p.status === "completed" ? await signedFile(p.id as string) : await signatureLink(p.id as string, "client") };
      } catch (e) {
        if (e instanceof SignatureError) throw new HttpError(e.status, e.message);
        throw e;
      }
    },

    /* ---------- Etapa 3 ---------- */
    async fleet() {
      // Igual à view tenant_fleet do app: sem placa e sem vendidos (conflito de datas é barrado ao reservar).
      const { data } = await db.from("vehicles").select("id,name,category,daily_rate,weekly_rate").neq("status", "sold").order("name").limit(50);
      return (data ?? []).map((v) => ({ id: v.id as string, name: v.name as string, category: (v.category as string | null) ?? null, dailyRate: (v.daily_rate as number | null) ?? null, weeklyRate: (v.weekly_rate as number | null) ?? null }));
    },
    async reservations(clientId) {
      const { data } = await db.from("reservations").select("id,vehicle_id,start_date,end_date,status").eq("client_id", clientId).order("start_date", { ascending: false }).limit(20);
      const ids = [...new Set((data ?? []).map((r) => r.vehicle_id as string))];
      const { data: vs } = ids.length ? await db.from("vehicles").select("id,name").in("id", ids) : { data: [] };
      const name = new Map((vs ?? []).map((v) => [v.id as string, v.name as string]));
      return (data ?? []).map((r) => ({ id: r.id as string, vehicleName: name.get(r.vehicle_id as string) ?? "Veículo", startDate: r.start_date as string, endDate: r.end_date as string, status: r.status as string }));
    },
    async reserve(clientId, vehicleId, startDate, endDate) {
      if (dryRun) {
        const { data: v } = await db.from("vehicles").select("name").eq("id", vehicleId).maybeSingle();
        return { vehicleName: (v?.name as string) ?? "Veículo" };
      }
      return requestReservation({ clientId, vehicleId, startDate, endDate, via: "whatsapp" });
    },
    async cancelReservation(clientId, id) {
      if (dryRun) return;
      await cancelReservation({ clientId, id, via: "whatsapp" });
    },
    async lead(name, vehicleId, startDate, endDate) {
      const { data: v } = vehicleId ? await db.from("vehicles").select("id,name").eq("id", vehicleId).neq("status", "sold").maybeSingle() : { data: null };
      if (dryRun) return;
      const row = { phone, name, vehicle_id: (v?.id as string) ?? null, start_date: startDate, end_date: endDate, updated_at: new Date().toISOString() };
      // Um lead aberto por telefone: nova escolha atualiza o mesmo registro.
      const { data: open } = await db.from("customer_bot_leads").select("id").eq("phone", phone).in("status", ["new", "contacted"]).maybeSingle();
      const { error } = open ? await db.from("customer_bot_leads").update(row).eq("id", open.id) : await db.from("customer_bot_leads").insert(row);
      if (error) throw new HttpError(500, "Não foi possível registrar seu interesse.");
      await notifyStaff([{ type: "lead.whatsapp", category: "reservations", severity: "info", title: "Novo interessado pelo WhatsApp", body: `${name} · ${phone}${v ? ` · ${v.name}` : ""}${startDate ? ` · ${formatDate(startDate)}${endDate ? ` a ${formatDate(endDate)}` : ""}` : ""}`, url: "/admin/requests?tab=leads", dedupeKey: `lead:${phone}:${new Date().toISOString().slice(0, 13)}` }], { companyAlert: false });
    },
  };
}

/** Métodos que a locadora oferece hoje (mesmas fontes de verdade do app). */
async function methods() {
  const db = serviceDb();
  const settings = await loadSettings(db);
  const asaas = await loadAsaasConfig(db).catch(() => null);
  const asaasOn = readyForCharges(asaas);
  const all = await getPaymentMethods(db, settings);
  return {
    asaasPix: asaasOn && Boolean(asaas?.methods.includes("PIX")),
    asaasBoleto: asaasOn && Boolean(asaas?.methods.includes("BOLETO")),
    infinitepay: infinitePayState(settings.infinitepay).checkout,
    pixManual: pixState(settings.pix).enabled && pixState(settings.pix).configured,
    gateways: GATEWAY_IDS.filter((id) => all.methods.some((m) => m.id === id && usable(m))),
  };
}

/** Atraso humanizado proporcional ao texto (1–3 s): reduz risco de bloqueio do chip. */
const humanDelay = (text: string) => new Promise((r) => setTimeout(r, Math.min(3000, 1000 + text.length * 8)));

/**
 * Processa uma mensagem de cliente/visitante. `transport` envia (webhook) ou captura (simulador, dry-run).
 * O limite por hora é aplicado antes de qualquer resposta.
 */
export async function runCustomerBot(
  ev: CopilotEvent,
  phone: string,
  cfg: CopilotConfig & { customer_rate_per_hour?: number },
  opts: { media?: { mimetype: string; data: string }; dryRun?: boolean; session?: CustomerSession; transport: (card: OutgoingCard) => Promise<void> },
) {
  const db = serviceDb();
  const orgId = requireOrg().org.id;
  if (!opts.dryRun) {
    const { data: gate } = await db.rpc("customer_bot_take", { p_org: orgId, p_phone: phone, p_limit: cfg.customer_rate_per_hour ?? 30 });
    if (gate === "blocked") return { replies: [], session: opts.session };
    if (gate === "warn") {
      const card: OutgoingCard = { text: "⏳ Recebemos muitas mensagens deste número. Aguarde alguns minutos e tente de novo, ou use o App Oficial: " + appUrlFor() };
      await opts.transport(card);
      return { replies: [card], session: opts.session };
    }
  }

  let session: CustomerSession = opts.session ?? { step: "menu", data: {}, clientId: null, verified: false, locked: false };
  if (!opts.session) {
    const { data: s } = await db.from("customer_bot_sessions").select("step,data,client_id,verified_until,pin_locked_until,expires_at").eq("phone", phone).maybeSingle();
    if (s) {
      const fresh = new Date(s.expires_at as string) > new Date();
      session = {
        step: fresh ? (s.step as string) : "menu",
        data: fresh ? ((s.data as Record<string, unknown>) ?? {}) : {},
        clientId: (s.client_id as string | null) ?? null,
        verified: Boolean(s.verified_until && new Date(s.verified_until as string) > new Date()),
        locked: Boolean(s.pin_locked_until && new Date(s.pin_locked_until as string) > new Date()),
      };
    }
  }
  const flowCfg: CustomerConfig = { orgName: brand().name, appUrl: appUrlFor(), today: todaySP(), methods: await methods(), periodicCheckin: await hasPlanFeature(requireOrg().org.id, "periodic_checkin") };
  const { replies, session: next } = await handleCustomer(ev, session, flowCfg, ports(phone, Boolean(opts.dryRun)), opts.media);

  if (!opts.dryRun) {
    // verified_until/pin ficam só com a função do banco; aqui grava passo e cliente.
    await db.from("customer_bot_sessions").upsert({ phone, client_id: next.clientId, step: next.step, data: next.data, expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }, { onConflict: "organization_id,phone" });
  }
  for (const r of replies) {
    const card = toCard(r);
    if (!opts.dryRun) await humanDelay(card.text);
    await opts.transport(card);
  }
  return { replies: replies.map(toCard), session: next };
}

/** Horário comercial (8h–20h, São Paulo): fora dele a cobrança segue pela Evolution, como sempre. */
export const businessHours = (now = new Date()) => {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(now));
  return h >= 8 && h < 20;
};

/**
 * Cobrança com botões pelo número do Copiloto (opcional, padrão desligado).
 * Retorna false quando não deve/consegue enviar — o chamador usa a Evolution (fallback, comportamento de sempre).
 */
export async function sendChargeWithButtons(phone: string, rentalId: string, receiptId: string, text: string): Promise<boolean> {
  try {
    const db = serviceDb();
    const { data: cfg } = await db.from("copilot_config").select("enabled,customer_bot_enabled,charge_buttons_enabled,customer_rate_per_hour,instance_key").maybeSingle();
    if (!cfg?.enabled || !cfg.customer_bot_enabled || !cfg.charge_buttons_enabled || !isWhaileysEnabled() || !businessHours()) return false;
    const to = toWhatsAppNumber(phone);
    if (!to || (await whaileysStatus(cfg.instance_key as string)).state !== "open") return false;
    const { data: gate } = await db.rpc("customer_bot_take", { p_org: requireOrg().org.id, p_phone: to, p_limit: cfg.customer_rate_per_hour ?? 30 });
    if (gate !== "ok") return false;
    const buttons = chargeButtons(`${rentalId}|${receiptId}`, await methods());
    const card = toCard({ text: `${text}\n\n📱 *App Oficial:* ${appUrlFor()}`, buttons });
    const { messageId } = await whaileysSend(cfg.instance_key as string, to, card);
    await db.from("copilot_messages").insert({ phone: to, direction: "out", provider_id: messageId, kind: "buttons", text: null });
    // Número digitado ("1", "2") também funciona: as opções ficam na sessão do cliente.
    await db.from("customer_bot_sessions").upsert({ phone: to, step: "menu", data: { opts: buttons.map((b) => b.id) }, expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() }, { onConflict: "organization_id,phone" });
    return true;
  } catch (e) {
    console.error("[charge-buttons]", (e as Error).message);
    return false;
  }
}

/** Envio real pela instância do Copiloto + registro do id (anti-loop). */
export function customerTransport(cfg: CopilotConfig, phone: string, to: string) {
  return async (card: OutgoingCard) => {
    const { messageId } = await whaileysSend(cfg.instance_key, to, card);
    await serviceDb().from("copilot_messages").insert({ phone, direction: "out", provider_id: messageId, kind: card.sections ? "list" : card.buttons ? "buttons" : "text", text: null });
  };
}
