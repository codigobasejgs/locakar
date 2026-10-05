import { after } from "next/server";
import { globalDb, runWithOrg, loadOrg, scoped } from "@/lib/server/org-context";
import { serviceDb } from "@/lib/server/push";
import { verifyAutentiqueSignature } from "@/lib/server/signature/autentique";
import { loadSignatureConfig, syncProcess, webhookSecret } from "@/lib/server/signature/service";

/**
 * Webhook Autentique. A locadora é resolvida pelo documento já mapeado, nunca por um id livre do payload.
 * Autenticidade: HMAC SHA-256 do corpo bruto no header x-autentique-signature (documentação oficial).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type EventData = { id?: unknown; document?: unknown; object?: unknown };
type Payload = { event?: { id?: unknown; type?: unknown; created_at?: unknown; data?: EventData } };

export const POST = scoped(async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 512_000) return Response.json({ error: "payload muito grande" }, { status: 413 });
  let body: Payload;
  try {
    body = JSON.parse(raw) as Payload;
  } catch {
    return Response.json({ error: "payload inválido" }, { status: 400 });
  }
  const event = body.event;
  const eventId = typeof event?.id === "string" ? event.id : "";
  const type = typeof event?.type === "string" ? event.type : "";
  // Documentação mostra os dois formatos: recurso direto em data ou aninhado em data.object.
  const data = (event?.data?.object && typeof event.data.object === "object" ? event.data.object : event?.data) as EventData | undefined;
  const documentId = typeof data?.document === "string" ? data.document : typeof data?.id === "string" ? data.id : "";
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(eventId) || !/^[a-z_]+\.[a-z_]+$/.test(type) || !/^[A-Za-z0-9_-]{8,160}$/.test(documentId)) {
    return Response.json({ error: "evento inválido" }, { status: 400 });
  }

  const { data: process } = await globalDb().from("contract_signature_processes").select("id,organization_id").eq("provider", "autentique").eq("provider_document_id", documentId).maybeSingle();
  if (!process) return Response.json({ received: true, ignored: true });
  const org = await loadOrg(process.organization_id as string);
  if (!org) return Response.json({ error: "unauthorized" }, { status: 401 });

  return runWithOrg({ org }, async () => {
    const db = serviceDb();
    const cfg = await loadSignatureConfig(db);
    let ok = false;
    try {
      ok = Boolean(cfg && verifyAutentiqueSignature(raw, request.headers.get("x-autentique-signature"), webhookSecret(cfg)));
    } catch {
      ok = false;
    }
    if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });

    const occurredAt = typeof event?.created_at === "string" && !Number.isNaN(Date.parse(event.created_at)) ? event.created_at : null;
    const { data: inserted, error } = await db
      .from("signature_events")
      .upsert({ provider_event_id: eventId, process_id: process.id, provider_document_id: documentId, event_type: type, occurred_at: occurredAt }, { onConflict: "provider_event_id", ignoreDuplicates: true })
      .select("provider_event_id");
    if (error) return Response.json({ error: "persistência indisponível" }, { status: 500 });
    if (!inserted?.length) return Response.json({ received: true, duplicate: true });

    after(async () => {
      try {
        await db.from("signature_events").update({ status: "processing" }).eq("provider_event_id", eventId);
        await syncProcess(process.id as string, undefined, eventId);
        await db.from("signature_events").update({ status: "done", processed_at: new Date().toISOString(), error: null }).eq("provider_event_id", eventId);
      } catch (e) {
        await db.from("signature_events").update({ status: "error", processed_at: new Date().toISOString(), error: e instanceof Error ? e.message.slice(0, 300) : "Falha ao sincronizar." }).eq("provider_event_id", eventId);
      }
    });
    return Response.json({ received: true });
  });
});
