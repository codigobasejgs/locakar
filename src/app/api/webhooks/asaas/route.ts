import { after } from "next/server";
import { loadAsaasConfig } from "@/lib/server/asaas";
import { parseEvent, processBacklog, processEvent, webhookEnvironment } from "@/lib/server/asaas-webhook";
import { serviceDb } from "@/lib/server/push";

/**
 * Webhook Asaas (docs: entrega "at least once"; responder 200 só após persistir; 15 falhas seguidas pausam a fila).
 * 1. autentica pelo header asaas-access-token (token próprio, nunca a API Key; só o hash fica no banco);
 * 2. persiste event.id (PRIMARY KEY) — reenvio do mesmo evento não cria registro nem efeito novo;
 * 3. responde 200 e processa depois da resposta (after), consultando a cobrança no Asaas.
 * Não depende de sessão do painel e funciona mesmo com a integração desativada (cobranças antigas).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const db = serviceDb();
  const cfg = await loadAsaasConfig(db);
  const env = webhookEnvironment(cfg, request.headers.get("asaas-access-token"));
  if (!env) return Response.json({ error: "unauthorized" }, { status: 401 });

  const text = await request.text();
  if (text.length > 512_000) return Response.json({ error: "payload muito grande" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "payload inválido" }, { status: 400 });
  }
  const ev = parseEvent(body);
  if (!ev) return Response.json({ error: "payload inválido" }, { status: 400 });

  const { data: inserted, error } = await db
    .from("asaas_webhook_events")
    .upsert({ id: ev.id, environment: env, event: ev.event, payment_id: ev.payment?.id ?? null, payload: body }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  // Falha ao persistir: 500 para o Asaas reenviar (nunca confirmar evento não armazenado).
  if (error) return Response.json({ error: "persistência indisponível" }, { status: 500 });

  after(async () => {
    if (inserted?.length) await processEvent(db, ev.id);
    await processBacklog(db, ev.id);
  });
  return Response.json({ received: true, duplicate: !inserted?.length });
}
