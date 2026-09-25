import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toWhatsAppNumber } from "@/lib/utils";
import type { EmailKind } from "@/types";

/**
 * Envio de WhatsApp pela Evolution API (v2). Chaves só no servidor.
 * EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE (padrão "locakar").
 */
export const isWhatsAppEnabled = () => Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY);

export interface OutgoingWhatsApp {
  kind: EmailKind;
  phone?: string;
  text: string;
  rentalId?: string;
  fineId?: string;
  contractId?: string;
  alertKeys?: string[];
  /** PDF enviado como documento; `text` vira a legenda. */
  document?: { filename: string; content: Uint8Array };
}

/**
 * Envia texto e registra no mesmo histórico dos e-mails (email_log, destino "whatsapp:<número>").
 * Não lança erro: WhatsApp é canal complementar e não deve bloquear a operação principal.
 */
export async function sendWhatsApp(db: SupabaseClient, msg: OutgoingWhatsApp): Promise<{ ok: boolean; error?: string }> {
  if (!isWhatsAppEnabled()) return { ok: false, error: "WhatsApp não configurado." };
  const number = toWhatsAppNumber(msg.phone);
  if (!number) return { ok: false, error: "Telefone do cliente inválido para WhatsApp." };

  const base = process.env.EVOLUTION_API_URL!.replace(/\/+$/, "");
  const instance = process.env.EVOLUTION_INSTANCE || "locakar";
  let error: string | undefined;
  let providerId: string | undefined;
  try {
    const doc = msg.document;
    const res = await fetch(`${base}/message/${doc ? "sendMedia" : "sendText"}/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { apikey: process.env.EVOLUTION_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify(
        doc
          ? { number, mediatype: "document", mimetype: "application/pdf", fileName: doc.filename, caption: msg.text, media: Buffer.from(doc.content).toString("base64") }
          : { number, text: msg.text, linkPreview: true },
      ),
      signal: AbortSignal.timeout(doc ? 30_000 : 15_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = json?.response?.message ?? json?.message ?? `HTTP ${res.status}`;
      // Evolution responde [{ exists: false }] quando o número não tem conta no WhatsApp.
      error = Array.isArray(detail) && detail[0]?.exists === false
        ? `O número ${number} não tem WhatsApp. Confira o DDD e o telefone cadastrado.`
        : typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 200);
    } else providerId = json?.key?.id;
  } catch (e) {
    error = (e as Error).name === "TimeoutError" ? "Servidor do WhatsApp não respondeu." : (e as Error).message;
  }

  await db.from("email_log").insert({
    kind: msg.kind,
    to_email: `whatsapp:${number}`,
    subject: msg.text.split("\n")[0].slice(0, 120),
    rental_id: msg.rentalId ?? null,
    fine_id: msg.fineId ?? null,
    contract_id: msg.contractId ?? null,
    alert_keys: msg.alertKeys ?? null,
    provider_id: providerId ?? null,
    status: error ? "failed" : "sent",
    error: error ?? null,
  });
  return error ? { ok: false, error } : { ok: true };
}
