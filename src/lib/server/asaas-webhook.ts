import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTxReference, type AsaasEnvironment, type PaymentSnapshot } from "@/lib/asaas";
import { sameHash, tokenHash } from "@/lib/server/asaas-crypto";
import { AsaasError, applySnapshot, envCols, loadAsaasConfig, reconcileTx, TX_COLS, type AsaasConfigRow, type AsaasTx } from "@/lib/server/asaas";
import { audit } from "@/lib/server/tenant";

/** Ambiente cujo token confere com o header asaas-access-token (comparação de hash em tempo constante). */
export function webhookEnvironment(cfg: AsaasConfigRow | null, token: string | null): AsaasEnvironment | null {
  if (!cfg || !token || token.length < 32 || token.length > 255) return null;
  const h = tokenHash(token);
  for (const env of ["production", "sandbox"] as const) {
    const stored = cfg[envCols(env).webhookHash];
    if (stored && sameHash(h, stored)) return env;
  }
  return null;
}

/** Valida o formato mínimo do evento (campos extras do Asaas são aceitos sem erro). */
export function parseEvent(body: unknown): { id: string; event: string; payment: PaymentSnapshot | null } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !b.id || b.id.length > 300 || typeof b.event !== "string" || !/^[A-Z0-9_]{3,80}$/.test(b.event)) return null;
  const p = b.payment && typeof b.payment === "object" ? (b.payment as PaymentSnapshot) : null;
  return { id: b.id, event: b.event, payment: p && typeof p.id === "string" ? p : null };
}

async function findTx(db: SupabaseClient, p: PaymentSnapshot): Promise<AsaasTx | null> {
  const ref = parseTxReference(p.externalReference);
  if (ref) {
    const { data } = await db.from("payment_transactions").select(TX_COLS).eq("id", ref).eq("provider", "asaas").maybeSingle();
    if (data) return data as AsaasTx;
  }
  const { data } = await db.from("payment_transactions").select(TX_COLS).eq("provider", "asaas").eq("provider_payment_id", p.id).maybeSingle();
  return (data as AsaasTx | null) ?? null;
}

/**
 * Processa um evento já persistido. Reserva atômica (pending/error → processing) impede processamento simultâneo;
 * a regra de negócio usa o estado atual da cobrança (GET), por isso evento duplicado/atrasado não gera efeito novo.
 * Integração desativada NÃO bloqueia: cobranças antigas continuam sendo conciliadas.
 */
export async function processEvent(db: SupabaseClient, id: string) {
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: claimed } = await db
    .from("asaas_webhook_events")
    .update({ status: "processing", locked_at: new Date().toISOString() })
    .eq("id", id)
    .or(`status.in.(pending,error),and(status.eq.processing,locked_at.lt.${staleBefore})`)
    .select("id,event,environment,payload,attempts")
    .maybeSingle();
  if (!claimed) return "skipped";
  const finish = (status: "done" | "ignored" | "error", last_error: string | null = null) =>
    db.from("asaas_webhook_events").update({ status, last_error, attempts: (claimed.attempts ?? 0) + 1, processed_at: new Date().toISOString(), locked_at: null }).eq("id", id);

  try {
    const ev = parseEvent(claimed.payload);
    if (!ev?.payment || !ev.event.startsWith("PAYMENT_")) {
      await finish("ignored", "Evento sem cobrança ou fora do escopo da integração.");
      return "ignored";
    }
    const tx = await findTx(db, ev.payment);
    if (!tx) {
      await finish("ignored", "Cobrança não pertence a esta locadora.");
      return "ignored";
    }
    const cfg = await loadAsaasConfig(db);
    if (!cfg) throw new Error("Configuração Asaas ausente.");
    try {
      await reconcileTx(db, cfg, { ...tx, environment: tx.environment ?? (claimed.environment as AsaasEnvironment) }, { type: "system" });
    } catch (e) {
      // Cobrança removida pode não ser mais consultável: usa o snapshot do evento só para remoção.
      if (!(e instanceof AsaasError && e.upstream === 404 && ev.event === "PAYMENT_DELETED")) throw e;
      await applySnapshot(db, tx.id, { ...ev.payment, deleted: true }, { type: "system" });
    }
    await finish("done");
    await audit({ actorType: "system", action: "asaas_webhook_processed", entity: "payment_transactions", entityId: tx.id, details: { event: ev.event, eventId: id, providerPaymentId: ev.payment.id } });
    return "done";
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 300) : "Falha ao processar o evento.";
    await finish("error", message);
    console.error("[asaas] webhook:", message);
    return "error";
  }
}

/** Recupera eventos que falharam ou ficaram presos (chamado a cada novo webhook; sem polling). */
export async function processBacklog(db: SupabaseClient, exceptId: string, limit = 5) {
  const before = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data } = await db.from("asaas_webhook_events").select("id").in("status", ["pending", "error", "processing"]).lt("received_at", before).lt("attempts", 8).neq("id", exceptId).order("received_at").limit(limit);
  for (const row of data ?? []) await processEvent(db, row.id);
}
