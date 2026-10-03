import "server-only";
import { globalDb, scoped } from "@/lib/server/org-context";
import { HttpError, errorResponse, serverSupabase } from "@/lib/server/supabase";
import type { OrgRole } from "@/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["active", "trial", "past_due", "suspended", "cancelled"];
const ROLES: OrgRole[] = ["owner", "admin", "manager", "finance", "operator", "viewer"];
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** Sessão do usuário + conferência no banco (platform_admins). Depois disso: service role sem escopo. */
async function requireSuperAdmin() {
  const supabase = await serverSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) throw new HttpError(401, "Sessão expirada.");
  const { data: ok } = await supabase.rpc("is_platform_admin");
  if (!ok) throw new HttpError(403, "Acesso restrito ao Super Admin da plataforma.");
  return { userId, db: globalDb() };
}

const fail = (error: { message: string } | null) => {
  if (error) throw new HttpError(400, error.message);
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const GET = scoped(async function GET(request: Request) {
  try {
    const { db, userId } = await requireSuperAdmin();
    const orgId = new URL(request.url).searchParams.get("org");

    // Detalhe de uma locadora: equipe com e-mail.
    if (orgId) {
      if (!UUID.test(orgId)) throw new HttpError(400, "Locadora inválida.");
      const { data: members, error } = await db.rpc("platform_org_members", { p_org: orgId });
      fail(error);
      return Response.json({ members: members ?? [] });
    }

    const [overview, plans, admins, config, audit, help] = await Promise.all([
      db.rpc("platform_overview"),
      db.from("plans").select("id, name, active, entitlements").order("name"),
      db.rpc("platform_admin_list"),
      db.from("platform_config").select("trial_days, grace_days").eq("id", 1).maybeSingle(),
      db.from("platform_audit").select("id, actor_id, action, organization_id, details, created_at").order("created_at", { ascending: false }).limit(50),
      // Opcional: se a migração da ajuda ainda não rodou, o painel segue funcionando sem este bloco.
      db.rpc("help_report", { p_days: 30 }),
    ]);
    fail(overview.error);
    return Response.json({
      me: userId,
      organizations: overview.data ?? [],
      plans: plans.data ?? [],
      admins: admins.data ?? [],
      config: config.data ?? { trial_days: 30, grace_days: 7 },
      audit: audit.data ?? [],
      help: help.error ? null : help.data,
    });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const { db, userId } = await requireSuperAdmin();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "");
    const orgId = String(body.organizationId || "");
    const now = new Date().toISOString();
    const log = (details: Record<string, unknown> = {}, org: string | null = orgId || null) =>
      db.from("platform_audit").insert({ actor_id: userId, action, organization_id: org, details });
    const needOrg = () => {
      if (!UUID.test(orgId)) throw new HttpError(400, "Locadora inválida.");
    };
    const userByEmail = async () => {
      const email = str(body.email, 120).toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "E-mail inválido.");
      const { data } = await db.rpc("platform_user_id", { p_email: email });
      if (!data) throw new HttpError(404, "Nenhuma conta com este e-mail. A pessoa precisa se cadastrar antes.");
      return { id: data as string, email };
    };

    switch (action) {
      case "status": {
        needOrg();
        const status = String(body.status);
        if (!STATUSES.includes(status)) throw new HttpError(400, "Status inválido.");
        fail((await db.from("organizations").update({ status, updated_at: now }).eq("id", orgId)).error);
        await log({ status });
        break;
      }
      case "plan": {
        needOrg();
        const planId = String(body.planId);
        fail((await db.from("subscriptions").upsert({ organization_id: orgId, plan_id: planId, updated_at: now })).error);
        await log({ planId });
        break;
      }
      case "extend_trial": {
        needOrg();
        const days = Number(body.days);
        if (!Number.isInteger(days) || days < 1 || days > 365) throw new HttpError(400, "Informe de 1 a 365 dias.");
        const { data: sub } = await db.from("subscriptions").select("trial_ends_at").eq("organization_id", orgId).maybeSingle();
        // Soma a partir do fim atual (se ainda no futuro) ou de hoje.
        const base = Math.max(Date.now(), sub?.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : 0);
        const trialEnds = new Date(base + days * 86_400_000).toISOString();
        fail((await db.from("subscriptions").update({ trial_ends_at: trialEnds, updated_at: now }).eq("organization_id", orgId)).error);
        // Teste vencido/suspenso volta a funcionar; locadora ativa (pagante) continua ativa.
        await db.from("organizations").update({ status: "trial", updated_at: now }).eq("id", orgId).in("status", ["past_due", "suspended"]);
        await log({ days, trialEnds });
        break;
      }
      case "update_org": {
        needOrg();
        const patch: Record<string, unknown> = { updated_at: now };
        const name = str(body.name, 80);
        if (name.length < 2) throw new HttpError(400, "Nome muito curto.");
        patch.name = name;
        const slug = str(body.slug, 40).toLowerCase();
        if (!SLUG.test(slug)) throw new HttpError(400, "Endereço: 3 a 40 letras minúsculas, números e hífens.");
        patch.slug = slug;
        for (const k of ["legal_name", "email", "phone", "whatsapp"] as const) patch[k] = str(body[k], 120) || null;
        patch.document = str(body.document, 20).replace(/\D/g, "") || null;
        const { error } = await db.from("organizations").update(patch).eq("id", orgId);
        if (error?.code === "23505") throw new HttpError(409, "Este endereço já está em uso.");
        fail(error);
        await log({ name, slug });
        break;
      }
      case "add_member": {
        needOrg();
        const role = String(body.role) as OrgRole;
        if (!ROLES.includes(role)) throw new HttpError(400, "Função inválida.");
        const u = await userByEmail();
        fail((await db.from("memberships").upsert({ organization_id: orgId, user_id: u.id, role, invited_by: userId })).error);
        await log({ email: u.email, role });
        break;
      }
      case "member_role": {
        needOrg();
        const role = String(body.role) as OrgRole;
        const target = String(body.userId || "");
        if (!ROLES.includes(role) || !UUID.test(target)) throw new HttpError(400, "Dados inválidos.");
        fail((await db.from("memberships").update({ role }).eq("organization_id", orgId).eq("user_id", target)).error);
        await log({ userId: target, role });
        break;
      }
      case "remove_member": {
        needOrg();
        const target = String(body.userId || "");
        if (!UUID.test(target)) throw new HttpError(400, "Usuário inválido.");
        const { data: owners } = await db.from("memberships").select("user_id").eq("organization_id", orgId).eq("role", "owner");
        if (owners?.length === 1 && owners[0].user_id === target) {
          throw new HttpError(400, "Este é o único proprietário. Defina outro proprietário antes de remover.");
        }
        fail((await db.from("memberships").delete().eq("organization_id", orgId).eq("user_id", target)).error);
        await db.from("user_preferences").update({ active_organization_id: null, updated_at: now }).eq("user_id", target).eq("active_organization_id", orgId);
        await log({ userId: target });
        break;
      }
      case "support_access": {
        // Entra no painel da locadora como administrador. Fica visível na equipe dela e na auditoria;
        // "Sair do suporte" remove o acesso.
        needOrg();
        const { data: mine } = await db.from("memberships").select("role").eq("organization_id", orgId).eq("user_id", userId).maybeSingle();
        if (!mine) fail((await db.from("memberships").insert({ organization_id: orgId, user_id: userId, role: "admin", invited_by: userId })).error);
        fail((await db.from("user_preferences").upsert({ user_id: userId, active_organization_id: orgId, updated_at: now })).error);
        await log({ alreadyMember: Boolean(mine) });
        return Response.json({ ok: true, redirect: "/admin" });
      }
      case "add_admin": {
        const u = await userByEmail();
        fail((await db.from("platform_admins").upsert({ user_id: u.id })).error);
        await log({ email: u.email }, null);
        break;
      }
      case "remove_admin": {
        const target = String(body.userId || "");
        if (target === userId) throw new HttpError(400, "Você não pode remover o seu próprio acesso de Super Admin.");
        fail((await db.from("platform_admins").delete().eq("user_id", target)).error);
        await log({ userId: target }, null);
        break;
      }
      case "config": {
        const trial = Number(body.trialDays);
        const grace = Number(body.graceDays);
        if (!Number.isInteger(trial) || trial < 0 || trial > 365 || !Number.isInteger(grace) || grace < 0 || grace > 90) {
          throw new HttpError(400, "Teste: 0 a 365 dias. Carência: 0 a 90 dias.");
        }
        fail((await db.from("platform_config").update({ trial_days: trial, grace_days: grace, updated_at: now }).eq("id", 1)).error);
        await log({ trial, grace }, null);
        break;
      }
      case "delete_org": {
        needOrg();
        const { data: org } = await db.from("organizations").select("slug, name").eq("id", orgId).maybeSingle();
        if (!org) throw new HttpError(404, "Locadora não encontrada.");
        if (str(body.confirm, 40) !== org.slug) throw new HttpError(400, `Digite exatamente "${org.slug}" para confirmar.`);
        const { data: removed, error } = await db.rpc("platform_delete_organization", { p_org: orgId });
        fail(error);
        // ponytail: arquivos no Storage ({orgId}/...) ficam órfãos; limpar pelo painel do Supabase se precisar do espaço.
        await log({ slug: org.slug, name: org.name, removed });
        return Response.json({ ok: true, removed });
      }
      default:
        throw new HttpError(400, "Ação inválida.");
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
});
