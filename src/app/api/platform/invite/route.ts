import "server-only";
import { createHash } from "node:crypto";
import { globalDb, loadOrg, scoped } from "@/lib/server/org-context";
import { HttpError, errorResponse, serverSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const hashToken = (tok: string) => createHash("sha256").update(tok).digest("hex");

/** Consulta informações do convite pelo token público. */
export const GET = scoped(async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    if (token.length < 16) throw new HttpError(400, "Convite inválido.");
    const h = hashToken(token);
    const db = globalDb();
    const { data: inv } = await db
      .from("organization_invites")
      .select("id, organization_id, email, role, expires_at, accepted_at, revoked_at")
      .eq("token_hash", h)
      .maybeSingle();
    if (!inv || inv.revoked_at || inv.accepted_at || new Date(inv.expires_at) < new Date()) {
      throw new HttpError(404, "Este convite expirou ou já foi utilizado.");
    }
    const org = await loadOrg(inv.organization_id);
    return Response.json({ email: inv.email, role: inv.role, orgName: org?.branding?.displayName || org?.name || "Locadora" });
  } catch (e) {
    return errorResponse(e);
  }
});

/** Aceite do convite pelo usuário logado. */
export const POST = scoped(async function POST(request: Request) {
  try {
    const supabase = await serverSupabase();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub as string | undefined;
    const email = claims?.claims?.email as string | undefined;
    if (!userId || !email) throw new HttpError(401, "Entre com a sua conta para aceitar o convite.");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const token = String(body.token || "");
    if (token.length < 16) throw new HttpError(400, "Convite inválido.");

    const db = globalDb();
    const { data: orgId, error } = await db.rpc("accept_invite", { p_user: userId, p_email: email, p_token_hash: hashToken(token) });
    if (error) {
      if (error.code === "42501") throw new HttpError(403, "Este convite foi enviado para outro endereço de e-mail.");
      throw new HttpError(400, error.message);
    }
    return Response.json({ ok: true, orgId, redirect: "/admin" });
  } catch (e) {
    return errorResponse(e);
  }
});
