import { isPushConfigured, serviceDb, vapidPublicKey } from "@/lib/server/push";
import { parseSubscription } from "@/lib/server/subscription";
import { HttpError, errorResponse } from "@/lib/server/supabase";
import { globalDb, loadOrg, scoped, setOrg } from "@/lib/server/org-context";

/**
 * Web Push do CLIENTE (sem login). Ativado na página do contrato (/assinar/<token>).
 * GET  ?token=… → { configured, publicKey }
 * POST { token, subscription } → vincula este navegador ao cliente do contrato
 * O cliente e a locadora são identificados pelo token do link (validado no banco), nunca por id enviado pelo navegador.
 */
export const dynamic = "force-dynamic";

async function clientFor(token: unknown) {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) throw new HttpError(404, "Contrato não encontrado.");
  const { data } = await globalDb().rpc("client_for_token", { p_token: token });
  if (!data) throw new HttpError(404, "Contrato não encontrado.");
  const clientId = data as string;
  const { data: client } = await globalDb().from("clients").select("organization_id").eq("id", clientId).maybeSingle();
  const org = client ? await loadOrg(client.organization_id as string) : null;
  if (!org) throw new HttpError(404, "Locadora não encontrada.");
  setOrg({ org });
  return clientId;
}

export const GET = scoped(async function GET(request: Request) {
  try {
    if (!isPushConfigured()) return Response.json({ configured: false, publicKey: null });
    await clientFor(new URL(request.url).searchParams.get("token"));
    return Response.json({ configured: true, publicKey: vapidPublicKey() });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    if (!isPushConfigured()) throw new HttpError(409, "Notificações indisponíveis no momento.");
    const body = (await request.json().catch(() => ({}))) as { token?: unknown; subscription?: unknown };
    const clientId = await clientFor(body.token);
    const sub = parseSubscription(body.subscription);
    const { error } = await serviceDb()
      .from("client_push_subscriptions")
      .upsert(
        { ...sub, client_id: clientId, user_agent: (request.headers.get("user-agent") ?? "").slice(0, 300), failures: 0, last_error: null, last_seen_at: new Date().toISOString() },
        { onConflict: "endpoint" },
      );
    if (error) throw new HttpError(500, "Não foi possível ativar as notificações.");
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
});
