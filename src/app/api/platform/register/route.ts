import "server-only";
import { globalDb, loadOrg, scoped } from "@/lib/server/org-context";
import { HttpError, errorResponse, serverSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** Cadastro self-service de nova locadora. Usuário precisa estar logado com e-mail confirmado. */
export const POST = scoped(async function POST(request: Request) {
  try {
    const supabase = await serverSupabase();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) throw new HttpError(401, "Crie uma conta e confirme seu e-mail para cadastrar sua locadora.");

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const db = globalDb();
    // Rate limit: máximo 3 tentativas por IP em 10 minutos
    const { data: allowed } = await db.rpc("hit_rate_limit", { p_key: `reg:${ip}`, p_max: 3, p_window: "10 minutes" });
    if (!allowed) throw new HttpError(429, "Muitas tentativas. Aguarde alguns minutos.");

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || "").trim().slice(0, 80);
    const slug = String(body.slug || "").trim().toLowerCase();
    const phone = body.phone ? String(body.phone).replace(/\D/g, "").slice(0, 15) : null;
    if (name.length < 2) throw new HttpError(400, "Informe o nome da locadora.");
    if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug)) {
      throw new HttpError(400, "O endereço da locadora deve ter entre 3 e 40 letras minúsculas, números e hífens.");
    }

    const { data: orgId, error } = await db.rpc("create_organization", { p_user: userId, p_name: name, p_slug: slug, p_phone: phone });
    if (error) {
      if (error.code === "23505") throw new HttpError(409, "Este endereço já está em uso. Escolha outro.");
      throw new HttpError(400, error.message);
    }
    const org = await loadOrg(orgId as string);
    return Response.json({ ok: true, org, redirect: "/admin" });
  } catch (e) {
    return errorResponse(e);
  }
});
