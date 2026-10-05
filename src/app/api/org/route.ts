import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { brandWarnings, isHex } from "@/lib/contrast";
import { INVITABLE_ROLES, type Permission } from "@/lib/permissions";
import { globalDb, loadOrg, scoped } from "@/lib/server/org-context";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import type { OrgBranding, OrgRole, OrgTexts } from "@/types";

export const dynamic = "force-dynamic";

/** Upload de imagem de marca: PNG, JPG ou WebP até 4 MB. SVG rejeitado (XSS).
 * ponytail: abaixo do limite de corpo da Vercel (~4,5 MB); para arquivos maiores, usar upload direto com URL assinada.
 */
const BRAND_MIMES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function checkImage(bytes: Uint8Array): "png" | "jpg" | "webp" {
  if (bytes.length > 4 * 1024 * 1024) throw new HttpError(413, "Imagem muito grande (máximo 4 MB).");
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "webp";
  throw new HttpError(400, "Formato inválido. Use PNG, JPG ou WebP.");
}

export const GET = scoped(async function GET() {
  try {
    const { orgId, role } = await requireStaff("read");
    const org = await loadOrg(orgId);
    if (!org) throw new HttpError(404, "Locadora não encontrada.");
    const db = globalDb();
    const [{ data: members }, { data: invites }, { data: sub }] = await Promise.all([
      db.from("memberships").select("user_id, role, created_at").eq("organization_id", orgId),
      db.from("organization_invites").select("id, email, role, created_at, expires_at, accepted_at, revoked_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20),
      db.from("subscriptions").select("plan_id, trial_ends_at, current_period_end, plans(name, entitlements)").eq("organization_id", orgId).maybeSingle(),
    ]);
    return Response.json({ org, role, members: members ?? [], invites: invites ?? [], subscription: sub ?? null });
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const { orgId, userId } = await requireStaff("settings");
    const db = globalDb();

    // Upload de logo (multipart)
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const slot = String(form.get("slot") || "");
      if (!["logo", "logoLight", "logoCompact", "favicon"].includes(slot)) throw new HttpError(400, "Slot inválido.");
      const file = form.get("file");
      if (!(file instanceof File) || !file.size) throw new HttpError(400, "Arquivo ausente.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = checkImage(bytes);
      const path = `${orgId}/${slot}-${Date.now()}.${ext}`;
      const { error: upErr } = await db.storage.from("branding").upload(path, bytes, { contentType: BRAND_MIMES[ext], upsert: true });
      if (upErr) throw new HttpError(500, `Falha no upload: ${upErr.message}`);
      const { data: pub } = db.storage.from("branding").getPublicUrl(path);
      const url = pub.publicUrl;
      const org = await loadOrg(orgId);
      const nextBranding: OrgBranding = { ...org?.branding, [slot]: url };
      await db.from("organizations").update({ branding: nextBranding, updated_at: new Date().toISOString() }).eq("id", orgId);
      return Response.json({ ok: true, url, branding: nextBranding });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    // Salvar dados da empresa
    if (body.action === "company") {
      const patch = {
        name: String(body.name || "").trim().slice(0, 80),
        legal_name: body.legalName ? String(body.legalName).trim().slice(0, 120) : null,
        document: body.document ? String(body.document).replace(/\D/g, "").slice(0, 14) : null,
        email: body.email ? String(body.email).trim().slice(0, 100) : null,
        phone: body.phone ? String(body.phone).replace(/\D/g, "").slice(0, 15) : null,
        whatsapp: body.whatsapp ? String(body.whatsapp).replace(/\D/g, "").slice(0, 15) : null,
        website: body.website ? String(body.website).trim().slice(0, 200) : null,
        address: body.address ? String(body.address).trim().slice(0, 200) : null,
        city: body.city ? String(body.city).trim().slice(0, 80) : null,
        state: body.state ? String(body.state).trim().toUpperCase().slice(0, 2) : null,
        cep: body.cep ? String(body.cep).replace(/\D/g, "").slice(0, 8) : null,
        updated_at: new Date().toISOString(),
      };
      if (!patch.name) throw new HttpError(400, "O nome fantasia da locadora é obrigatório.");
      const { error } = await db.from("organizations").update(patch).eq("id", orgId);
      if (error) throw new HttpError(500, error.message);
      return Response.json({ ok: true, org: await loadOrg(orgId) });
    }

    // Salvar aparência (cores + tema + nome exibido)
    if (body.action === "branding") {
      const cur = (await loadOrg(orgId))?.branding ?? {};
      const primary = isHex(body.primary) ? (body.primary as string).toLowerCase() : cur.primary || "#2563eb";
      const secondary = isHex(body.secondary) ? (body.secondary as string).toLowerCase() : cur.secondary;
      const accent = isHex(body.accent) ? (body.accent as string).toLowerCase() : cur.accent;
      const theme = ["light", "dark", "system"].includes(String(body.theme)) ? (body.theme as "light" | "dark" | "system") : cur.theme || "system";
      const displayName = typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim().slice(0, 60) : undefined;
      const branding: OrgBranding = { ...cur, primary, secondary, accent, theme, displayName };
      const warnings = brandWarnings(branding);
      const { error } = await db.from("organizations").update({ branding, updated_at: new Date().toISOString() }).eq("id", orgId);
      if (error) throw new HttpError(500, error.message);
      return Response.json({ ok: true, branding, warnings });
    }

    // Salvar textos
    if (body.action === "texts") {
      const texts: OrgTexts = {
        welcome: typeof body.welcome === "string" ? body.welcome.slice(0, 400) : undefined,
        billing: typeof body.billing === "string" ? body.billing.slice(0, 400) : undefined,
        support: typeof body.support === "string" ? body.support.slice(0, 400) : undefined,
        footer: typeof body.footer === "string" ? body.footer.slice(0, 200) : undefined,
      };
      await db.from("organizations").update({ texts, updated_at: new Date().toISOString() }).eq("id", orgId);
      return Response.json({ ok: true, texts });
    }

    // Convidar membro da equipe
    if (body.action === "invite") {
      await requireStaff("team" as Permission);
      const email = String(body.email || "").trim().toLowerCase();
      const role = String(body.role || "") as OrgRole;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "E-mail inválido.");
      if (!INVITABLE_ROLES.includes(role)) throw new HttpError(400, "Função inválida.");
      const token = randomBytes(24).toString("base64url");
      const hash = createHash("sha256").update(token).digest("hex");
      const { data: inv, error } = await db
        .from("organization_invites")
        .insert({ organization_id: orgId, email, role, token_hash: hash, invited_by: userId })
        .select("id, email, role, expires_at")
        .single();
      if (error) throw new HttpError(500, error.message);
      const link = `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.locakar.com.br"}/convite/${token}`;
      return Response.json({ ok: true, invite: inv, link });
    }

    // Revogar convite
    if (body.action === "revoke_invite") {
      await requireStaff("team" as Permission);
      const id = String(body.id || "");
      await db.from("organization_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("organization_id", orgId);
      return Response.json({ ok: true });
    }

    // Remover membro
    if (body.action === "remove_member") {
      await requireStaff("team" as Permission);
      const targetUser = String(body.userId || "");
      if (targetUser === userId) throw new HttpError(400, "Você não pode remover seu próprio acesso.");
      const { error } = await db.from("memberships").delete().eq("organization_id", orgId).eq("user_id", targetUser);
      if (error) throw new HttpError(500, error.message);
      return Response.json({ ok: true });
    }

    // Exportação de dados (LGPD)
    if (body.action === "export") {
      const tables = ["vehicles", "clients", "rentals", "reservations", "expenses", "maintenance", "fines", "notes", "contracts", "settings"];
      const dump: Record<string, unknown> = { exported_at: new Date().toISOString(), organization_id: orgId };
      for (const t of tables) {
        const { data } = await db.from(t).select("*").eq("organization_id", orgId);
        dump[t] = data ?? [];
      }
      return Response.json({ ok: true, dump });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});
