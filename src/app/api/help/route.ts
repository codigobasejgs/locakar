import "server-only";
import { articles } from "@/help";
import { globalDb, scoped } from "@/lib/server/org-context";
import { HttpError, errorResponse, serverSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

const SLUGS = new Set(articles.map((a) => a.slug));
// CPF, telefone, e-mail ou números longos não entram na base de buscas.
const PERSONAL = /\d{6,}|@|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/;

/**
 * Métricas da Central de Ajuda: visualização de artigo, avaliação e busca (com quantidade de resultados).
 * Não grava usuário, e-mail nem IP. A locadora vem da sessão (equipe), nunca do corpo.
 * Locatário (ajuda pública) grava sem locadora, com limite por IP.
 */
export const POST = scoped(async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = String(body.kind || "");
    if (!["feedback", "search", "view"].includes(kind)) throw new HttpError(400, "Evento inválido.");

    const supabase = await serverSupabase();
    const { data: claims } = await supabase.auth.getClaims();
    const db = globalDb();
    let organization: string | null = null;
    let audience: "admin" | "tenant" = "tenant";
    if (claims?.claims?.sub && body.audience === "admin") {
      const { data: m } = await supabase.rpc("current_membership");
      organization = (m as { organization_id?: string } | null)?.organization_id ?? null;
      if (organization) audience = "admin";
    }
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    const { data: allowed } = await db.rpc("hit_rate_limit", { p_key: `help:${organization ?? ip}`, p_max: 120, p_window: "10 minutes" });
    if (!allowed) return new Response(null, { status: 204 });

    const article = typeof body.article === "string" && SLUGS.has(body.article) ? body.article : null;
    const row: Record<string, unknown> = { kind, audience, organization_id: organization };
    if (kind === "search") {
      const query = String(body.query || "").trim().toLowerCase().slice(0, 80);
      if (query.length < 2 || PERSONAL.test(query)) return new Response(null, { status: 204 });
      row.query = query;
      row.results = Math.max(0, Math.min(500, Number(body.results) || 0));
    } else {
      if (!article) throw new HttpError(400, "Artigo inválido.");
      row.article = article;
      if (kind === "feedback") {
        row.helpful = body.helpful === true;
        const comment = String(body.comment || "").trim().slice(0, 300);
        row.comment = comment && !PERSONAL.test(comment) ? comment : null;
      }
    }
    const { error } = await db.from("help_events").insert(row);
    if (error) throw new HttpError(500, error.message);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
});
