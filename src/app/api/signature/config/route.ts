import { randomBytes } from "node:crypto";
import { serviceDb } from "@/lib/server/push";
import { encryptSignatureSecret, hasSignatureKey, loadSignatureConfig, providerFor, publicSignatureConfig } from "@/lib/server/signature/service";
import { SignatureError, type SignatureEnvironment } from "@/lib/server/signature/types";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { audit, clientIp } from "@/lib/server/tenant";
import { scoped } from "@/lib/server/org-context";

/**
 * Configurações → Integrações → Autentique.
 * Token e segredo do webhook são cifrados no servidor e nunca voltam ao navegador.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const noStore = { headers: { "Cache-Control": "private, no-store" } };
const envOf = (v: unknown): SignatureEnvironment => {
  if (v !== "sandbox" && v !== "production") throw new HttpError(400, "Ambiente inválido.");
  return v;
};

export const GET = scoped(async function GET() {
  try {
    await requireStaff("integrations");
    return Response.json(publicSignatureConfig(await loadSignatureConfig(serviceDb())), noStore);
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const { userId } = await requireStaff("integrations");
    const ip = clientIp(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const db = serviceDb();
    const cfg = await loadSignatureConfig(db);
    const save = async (patch: Record<string, unknown>) => {
      const { error } = await db.from("signature_provider_config").upsert({ ...patch, updated_by: userId, updated_at: new Date().toISOString() });
      if (error) throw new HttpError(500, "Não foi possível salvar a configuração.");
    };

    if (body.action === "token") {
      if (!hasSignatureKey()) throw new HttpError(409, "Configure SIGNATURE_ENCRYPTION_KEY no servidor antes de salvar o token.");
      const env = envOf(body.environment);
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (token.length < 20 || token.length > 500 || /\s/.test(token)) throw new HttpError(422, "Informe um token Autentique válido.");
      await save({ [`${env}_token_enc`]: encryptSignatureSecret(token), [`${env}_token_last4`]: token.slice(-4), [`${env}_verified_at`]: null, last_error: null });
      await audit({ actorType: "staff", actorId: userId, action: "autentique_token_configured", entity: "signature_provider_config", entityId: "autentique", details: { environment: env }, ip });
      return Response.json(publicSignatureConfig(await loadSignatureConfig(db)), noStore);
    }

    if (body.action === "webhook") {
      if (!hasSignatureKey()) throw new HttpError(409, "Configure SIGNATURE_ENCRYPTION_KEY no servidor antes de salvar o segredo.");
      const secret = typeof body.secret === "string" && body.secret.trim() ? body.secret.trim() : randomBytes(32).toString("hex");
      if (secret.length < 24 || secret.length > 300) throw new HttpError(422, "Segredo do webhook inválido.");
      await save({ webhook_secret_enc: encryptSignatureSecret(secret), last_error: null });
      await audit({ actorType: "staff", actorId: userId, action: "autentique_webhook_secret_configured", entity: "signature_provider_config", entityId: "autentique", details: {}, ip });
      return Response.json({ ...publicSignatureConfig(await loadSignatureConfig(db)), webhookSecret: typeof body.secret === "string" && body.secret.trim() ? undefined : secret }, noStore);
    }

    if (body.action === "test") {
      const env = envOf(body.environment);
      if (!cfg) throw new HttpError(409, "Salve o token antes de testar.");
      try {
        const account = await providerFor(cfg, env).testConnection();
        await save({ [`${env}_verified_at`]: new Date().toISOString(), autentique_organization_id: account.autentiqueOrganizationId, last_error: null });
      } catch (e) {
        const message = e instanceof SignatureError ? e.message : "Não foi possível conectar à Autentique.";
        await save({ [`${env}_verified_at`]: null, last_error: message });
        throw new HttpError(e instanceof SignatureError ? e.status : 502, message);
      } finally {
        await audit({ actorType: "staff", actorId: userId, action: "autentique_connection_tested", entity: "signature_provider_config", entityId: "autentique", details: { environment: env }, ip });
      }
      return Response.json({ ...publicSignatureConfig(await loadSignatureConfig(db)), message: "Conexão realizada com sucesso." }, noStore);
    }

    if (body.action === "save") {
      const env = envOf(body.environment);
      const enabled = body.enabled === true;
      const verified = env === "sandbox" ? cfg?.sandbox_verified_at : cfg?.production_verified_at;
      if (enabled && (!verified || !cfg?.webhook_secret_enc)) throw new HttpError(409, "Antes de ativar, salve o token, teste a conexão e configure o segredo do webhook.");
      const reminder = body.reminder === "DAILY" || body.reminder === "WEEKLY" ? body.reminder : null;
      const email = typeof body.companySignerEmail === "string" && body.companySignerEmail.trim() ? body.companySignerEmail.trim().slice(0, 160) : null;
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(422, "E-mail do representante inválido.");
      await save({ enabled, environment: env, sortable: body.sortable !== false, reminder, company_signer_email: email });
      await audit({ actorType: "staff", actorId: userId, action: enabled ? "autentique_enabled" : "autentique_settings_saved", entity: "signature_provider_config", entityId: "autentique", details: { environment: env, sortable: body.sortable !== false, reminder }, ip });
      return Response.json(publicSignatureConfig(await loadSignatureConfig(db)), noStore);
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});
