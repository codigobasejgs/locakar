/** Chamadas do painel às rotas de API do servidor (cookies da sessão vão junto automaticamente). */
import { isSupabaseEnabled } from "./supabase/env";

export type EmailRequest =
  | { kind: "test"; to: string }
  | { kind: "contract_signature"; contractId: string }
  | { kind: "delivery" | "return"; rentalId: string }
  | { kind: "receipt"; rentalId: string; receiptId: string }
  | { kind: "fine"; fineId: string }
  | { kind: "reservation"; reservationId: string }
  | { kind: "maintenance"; maintenanceId: string };

/**
 * Notifica o cliente por e-mail e WhatsApp (cada canal quando disponível).
 * Retorna a descrição dos envios (ex.: "e-mail x@y e WhatsApp (19) 9..."). Lança erro se nenhum canal enviar.
 */
export async function sendEmailRequest(req: EmailRequest): Promise<string> {
  if (!isSupabaseEnabled) throw new Error("Notificações disponíveis apenas com o banco de dados conectado.");
  const res = await fetch("/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Falha ao enviar a notificação.");
  return json.to as string;
}
