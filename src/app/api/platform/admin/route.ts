import "server-only";
import { globalDb, scoped } from "@/lib/server/org-context";
import { HttpError, errorResponse, serverSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

async function requireSuperAdmin() {
  const supabase = await serverSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) throw new HttpError(401, "Sessão expirada.");
  const { data: ok } = await supabase.rpc("is_platform_admin");
  if (!ok) throw new HttpError(403, "Acesso restrito ao Super Admin da plataforma.");
  return { userId, db: globalDb() };
}

export const GET = scoped(async function GET() {
  try {
    const { db } = await requireSuperAdmin();
    const [{ data: orgs }, { data: plans }] = await Promise.all([
      db
        .from("organizations")
        .select("id, slug, name, legal_name, document, email, phone, status, created_at, subscriptions(plan_id, trial_ends_at, current_period_end)")
        .order("created_at", { ascending: false }),
      db.from("plans").select("id, name, active, entitlements"),
    ]);

    // Contadores por organização
    const list = await Promise.all(
      (orgs ?? []).map(async (o) => {
        const [{ count: vehicles }, { count: users }] = await Promise.all([
          db.from("vehicles").select("id", { count: "exact", head: true }).eq("organization_id", o.id),
          db.from("memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", o.id),
        ]);
        return { ...o, vehiclesCount: vehicles ?? 0, usersCount: users ?? 0 };
      }),
    );

    return Response.json({ organizations: list, plans: plans ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const { db } = await requireSuperAdmin();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orgId = String(body.organizationId || "");
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new HttpError(400, "Organização inválida.");

    if (body.action === "status") {
      const status = String(body.status);
      if (!["active", "trial", "past_due", "suspended", "cancelled"].includes(status)) throw new HttpError(400, "Status inválido.");
      const { error } = await db.from("organizations").update({ status, updated_at: new Date().toISOString() }).eq("id", orgId);
      if (error) throw new HttpError(500, error.message);
      return Response.json({ ok: true });
    }

    if (body.action === "plan") {
      const planId = String(body.planId);
      const { error } = await db.from("subscriptions").update({ plan_id: planId, updated_at: new Date().toISOString() }).eq("organization_id", orgId);
      if (error) throw new HttpError(500, error.message);
      return Response.json({ ok: true });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});
