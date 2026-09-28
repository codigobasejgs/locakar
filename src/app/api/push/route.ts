import { describeEvent, isPushCollection, type PushCollection } from "@/lib/push-events";
import { isPushConfigured, notifyStaff, sendPushToUser, serviceDb, vapidPublicKey } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { fromRow } from "@/repositories/mapping";

/**
 * Web Push da equipe (VAPID). Somente usuários da equipe (tabela staff).
 * GET  → { configured, publicKey } — chave pública VAPID (a privada nunca sai do servidor).
 * POST → { action: "register", subscription }   inscreve este navegador (upsert pelo endpoint)
 *        { action: "unregister", endpoint }     remove este navegador
 *        { action: "test" }                     push de teste para os dispositivos de quem pediu
 *        { action: "event", collection, id, events } evento de negócio gravado pelo painel
 * O usuário vem da sessão (cookies), nunca do corpo da requisição.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TABLE: Record<PushCollection, string> = {
  rentals: "rentals",
  reservations: "reservations",
  clients: "clients",
  vehicles: "vehicles",
  expenses: "expenses",
  maintenance: "maintenance",
  fines: "fines",
  notes: "notes",
};

const b64url = /^[A-Za-z0-9_-]+={0,2}$/;

function parseSubscription(input: unknown) {
  const s = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof s?.endpoint === "string" ? s.endpoint : "";
  const p256dh = typeof s?.keys?.p256dh === "string" ? s.keys.p256dh : "";
  const auth = typeof s?.keys?.auth === "string" ? s.keys.auth : "";
  let url: URL | null = null;
  try {
    url = new URL(endpoint);
  } catch {
    /* inválido abaixo */
  }
  if (!url || url.protocol !== "https:" || endpoint.length > 1000) throw new HttpError(422, "Inscrição inválida (endpoint).");
  if (!b64url.test(p256dh) || p256dh.length < 40 || p256dh.length > 200) throw new HttpError(422, "Inscrição inválida (p256dh).");
  if (!b64url.test(auth) || auth.length < 10 || auth.length > 100) throw new HttpError(422, "Inscrição inválida (auth).");
  return { endpoint, p256dh, auth };
}

export async function GET() {
  try {
    await requireStaff();
    return Response.json({ configured: isPushConfigured(), publicKey: vapidPublicKey() || null });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireStaff();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims!.claims.sub as string;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      subscription?: unknown;
      endpoint?: string;
      collection?: string;
      id?: string;
      events?: unknown;
    };

    if (body.action === "register") {
      const sub = parseSubscription(body.subscription);
      const now = new Date().toISOString();
      const row = { ...sub, user_id: userId, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300), failures: 0, last_error: null, updated_at: now, last_seen_at: now };
      // Endpoint já cadastrado por outra pessoa (mesmo navegador, troca de login): passa para quem está logado.
      const db = isPushConfigured() ? serviceDb() : supabase;
      const { error } = await db.from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
      if (error) throw new HttpError(500, "Não foi possível salvar a inscrição.");
      return Response.json({ ok: true });
    }

    if (body.action === "unregister") {
      if (typeof body.endpoint !== "string") throw new HttpError(422, "Endpoint ausente.");
      await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", userId);
      return Response.json({ ok: true });
    }

    if (!isPushConfigured()) throw new HttpError(409, "Web Push não configurado no servidor (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e SUPABASE_SECRET_KEY).");

    if (body.action === "test") {
      const r = await sendPushToUser(serviceDb(), userId, {
        title: "Notificações ativadas",
        body: "Você vai receber aqui os avisos do painel da LOCAKAR.",
        url: "/admin/settings",
        severity: "success",
        tag: "locakar-teste",
      });
      if (!r.sent) throw new HttpError(422, r.expired ? "A inscrição deste navegador expirou. Ative as notificações novamente." : "Nenhum dispositivo recebeu. Ative as notificações neste navegador.");
      return Response.json({ ok: true, ...r });
    }

    if (body.action === "event") {
      if (!body.collection || !isPushCollection(body.collection) || typeof body.id !== "string") throw new HttpError(422, "Evento inválido.");
      const kinds = (Array.isArray(body.events) ? body.events : []).filter((k): k is string => typeof k === "string" && /^[a-z_]+(:[\w-]{1,80})?$/.test(k)).slice(0, 3);
      if (!kinds.length) return Response.json({ ok: true, created: 0 });
      // Relê o registro com a sessão de quem fez a alteração (RLS): o texto sai do banco, não do navegador.
      const { data: row } = await supabase.from(TABLE[body.collection]).select("*").eq("id", body.id).maybeSingle();
      if (!row) throw new HttpError(404, "Registro não encontrado.");
      const record = fromRow<Record<string, unknown>>(row);
      const [client, vehicle] = await Promise.all([
        typeof record.clientId === "string" ? supabase.from("clients").select("name").eq("id", record.clientId).maybeSingle() : null,
        typeof record.vehicleId === "string" ? supabase.from("vehicles").select("plate").eq("id", record.vehicleId).maybeSingle() : null,
      ]);
      const ctx = { collection: body.collection, record, clientName: client?.data?.name as string | undefined, plate: vehicle?.data?.plate as string | undefined };
      const events = kinds.map((k) => describeEvent(k, ctx)).filter((e) => e !== null);
      const report = await notifyStaff(events, { createdBy: userId });
      return Response.json({ ok: true, ...report });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
}
