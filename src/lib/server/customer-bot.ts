import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { billingOf, chargeFor, PERIOD_UNIT } from "@/lib/billing";
import { handleCustomer, type CustomerConfig, type CustomerPorts, type CustomerSession, type OpenInstallment } from "@/lib/customer-bot/flow";
import { matchClients } from "@/lib/customer-bot/identify";
import type { CopilotEvent } from "@/lib/copilot/parse";
import { normalizeHandle } from "@/lib/infinitepay";
import { infinitePayState, pixState } from "@/lib/payment-methods";
import { bankSlipLine, createCharge, loadAsaasConfig, pixQrCode, readyForCharges } from "@/lib/server/asaas";
import { createReceiptCheckout } from "@/lib/server/infinitepay";
import { brand, requireOrg, siteUrl } from "@/lib/server/org-context";
import { loadSettings, notifyStaff, serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { audit } from "@/lib/server/tenant";
import { daysBetween, formatCurrency, formatDate, todaySP } from "@/lib/utils";
import { fromRow } from "@/repositories/mapping";
import type { Rental } from "@/types";
import { toCard, type CopilotConfig } from "./copilot";
import { whaileysSend, type OutgoingCard } from "./whaileys";

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
  };
}

/** Métodos que a locadora oferece hoje (mesmas fontes de verdade do app). */
async function methods() {
  const db = serviceDb();
  const settings = await loadSettings(db);
  const asaas = await loadAsaasConfig(db).catch(() => null);
  const asaasOn = readyForCharges(asaas);
  return {
    asaasPix: asaasOn && Boolean(asaas?.methods.includes("PIX")),
    asaasBoleto: asaasOn && Boolean(asaas?.methods.includes("BOLETO")),
    infinitepay: infinitePayState(settings.infinitepay).checkout,
    pixManual: pixState(settings.pix).enabled && pixState(settings.pix).configured,
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
  const flowCfg: CustomerConfig = { orgName: brand().name, appUrl: appUrlFor(), methods: await methods() };
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

/** Envio real pela instância do Copiloto + registro do id (anti-loop). */
export function customerTransport(cfg: CopilotConfig, phone: string, to: string) {
  return async (card: OutgoingCard) => {
    const { messageId } = await whaileysSend(cfg.instance_key, to, card);
    await serviceDb().from("copilot_messages").insert({ phone, direction: "out", provider_id: messageId, kind: card.sections ? "list" : card.buttons ? "buttons" : "text", text: null });
  };
}
