/** Chamadas do painel às rotas de API do servidor (cookies da sessão vão junto automaticamente). */
import { isSupabaseEnabled } from "./supabase/env";

export type EmailRequest =
  | { kind: "contract_signature"; contractId: string }
  | { kind: "delivery" | "return"; rentalId: string }
  | { kind: "receipt"; rentalId: string; receiptId: string }
  | { kind: "fine"; fineId: string };

/** Envia um e-mail transacional. Retorna o destinatário. Lança erro com mensagem legível. */
export async function sendEmailRequest(req: EmailRequest): Promise<string> {
  if (!isSupabaseEnabled) throw new Error("Envio de e-mail disponível apenas com o banco de dados conectado.");
  const res = await fetch("/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Falha ao enviar o e-mail.");
  return json.to as string;
}
