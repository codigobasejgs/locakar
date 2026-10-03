import { ASAAS_METHODS, last4, validateApiKey, type AsaasEnvironment } from "@/lib/asaas";
import { encryptSecret, hasMasterKey, newWebhookToken, tokenHash } from "@/lib/server/asaas-crypto";
import { ASAAS_WEBHOOK_EVENTS, AsaasError, apiKeyFor, asaasFetch, envCols, loadAsaasConfig, publicConfig, webhookUrl } from "@/lib/server/asaas";
import { serviceDb } from "@/lib/server/push";
import { HttpError, errorResponse, requireStaff } from "@/lib/server/supabase";
import { audit, clientIp } from "@/lib/server/tenant";
import { brand, scoped } from "@/lib/server/org-context";

/**
 * Configurações → Asaas (somente equipe; asaas_config só é acessível pelo service role).
 * GET  → estado público (nunca a chave nem o token do webhook)
 * POST { action: "key" | "test" | "save" | "disable", ... }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function staff() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.auth.getClaims();
  return data!.claims.sub as string;
}
const envOf = (v: unknown): AsaasEnvironment => {
  if (v !== "sandbox" && v !== "production") throw new HttpError(400, "Ambiente inválido.");
  return v;
};
const pct = (v: unknown, max: number) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpError(422, "Percentual inválido.");
  return n === 0 ? null : Math.round(n * 100) / 100;
};
const noStore = { headers: { "Cache-Control": "private, no-store" } };

export const GET = scoped(async function GET() {
  try {
    await staff();
    const db = serviceDb();
    return Response.json(publicConfig(await loadAsaasConfig(db)), noStore);
  } catch (e) {
    return errorResponse(e);
  }
});

export const POST = scoped(async function POST(request: Request) {
  try {
    const operator = await staff();
    const ip = clientIp(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const db = serviceDb();
    const cfg = await loadAsaasConfig(db);
    if (!cfg) throw new HttpError(409, "Aplique a migration 20261008000000_asaas.sql no Supabase.");
    const save = async (patch: Record<string, unknown>) => {
      const { error } = await db.from("asaas_config").update({ ...patch, updated_by: operator });
      if (error) throw new HttpError(500, "Não foi possível salvar a configuração.");
    };

    // ---------- Salvar/trocar a API Key (cifrada; volta só mascarada) ----------
    if (body.action === "key") {
      if (!hasMasterKey()) throw new HttpError(409, "Configure ASAAS_ENCRYPTION_KEY no servidor (Vercel) antes de salvar a chave.");
      const env = envOf(body.environment);
      let key: string;
      try {
        key = validateApiKey(body.apiKey, env);
      } catch (e) {
        throw new HttpError(422, (e as Error).message);
      }
      const c = envCols(env);
      const replaced = Boolean(cfg[c.keyEnc]);
      // Chave nova precisa ser testada de novo; produção ativa sem chave verificada é bloqueada em readyForCharges.
      await save({ [c.keyEnc]: encryptSecret(key), [c.last4]: last4(key), [c.verified]: null, last_error: null });
      await audit({ actorType: "staff", actorId: operator, action: replaced ? "asaas_key_replaced" : "asaas_key_configured", entity: "asaas_config", entityId: "1", details: { environment: env }, ip });
      return Response.json(publicConfig(await loadAsaasConfig(db)), noStore);
    }

    // ---------- Testar conexão e registrar o webhook do ambiente ----------
    if (body.action === "test") {
      const env = envOf(body.environment);
      const c = envCols(env);
      const key = apiKeyFor(cfg, env);
      try {
        await asaasFetch(env, key, "GET", "/customers?limit=1");
      } catch (e) {
        const message = e instanceof AsaasError ? e.message : "Não foi possível autenticar no Asaas.";
        await save({ [c.verified]: null, last_error: message });
        await audit({ actorType: "staff", actorId: operator, action: "asaas_connection_tested", entity: "asaas_config", entityId: "1", details: { environment: env, ok: false }, ip });
        throw new HttpError(422, message);
      }
      // Webhook com token próprio (independente da API Key). Guardamos só o hash.
      const token = newWebhookToken();
      const email = typeof body.email === "string" && body.email.includes("@") ? body.email.trim() : brand().email || undefined;
      const hook = { name: `${brand().name} — Cobranças`.slice(0, 60), url: webhookUrl(), email, enabled: true, interrupted: false, apiVersion: 3, authToken: token, sendType: "NON_SEQUENTIALLY", events: ASAAS_WEBHOOK_EVENTS };
      let webhookId = cfg[c.webhookId];
      let webhookError: string | null = null;
      try {
        if (webhookId) {
          try {
            await asaasFetch(env, key, "PUT", `/webhooks/${encodeURIComponent(webhookId)}`, { url: hook.url, enabled: true, interrupted: false, authToken: token, sendType: hook.sendType, events: hook.events });
          } catch (e) {
            if (!(e instanceof AsaasError && e.upstream === 404)) throw e;
            webhookId = null;
          }
        }
        if (!webhookId) webhookId = (await asaasFetch<{ id: string }>(env, key, "POST", "/webhooks", hook)).id;
      } catch (e) {
        webhookError = `Conexão OK, mas o webhook não foi registrado: ${e instanceof AsaasError ? e.message : "erro desconhecido"}. A URL ${hook.url} precisa ser pública (HTTPS).`;
      }
      await save({
        [c.verified]: new Date().toISOString(),
        ...(webhookError ? { last_error: webhookError } : { [c.webhookId]: webhookId, [c.webhookHash]: tokenHash(token), last_error: null }),
      });
      await audit({ actorType: "staff", actorId: operator, action: "asaas_connection_tested", entity: "asaas_config", entityId: "1", details: { environment: env, ok: true, webhook: !webhookError }, ip });
      return Response.json({ ...publicConfig(await loadAsaasConfig(db)), message: webhookError ?? "Conexão realizada com sucesso. Webhook registrado." }, noStore);
    }

    // ---------- Preferências (ativar, ambiente, meios, encargos, notificações) ----------
    if (body.action === "save") {
      const env = envOf(body.environment);
      const c = envCols(env);
      const methods = Array.isArray(body.methods) ? body.methods.filter((m): m is (typeof ASAAS_METHODS)[number] => ASAAS_METHODS.includes(m as never)) : [];
      const allowUndefined = body.allowUndefined === true;
      const enabled = cfg.enabled; // Disponibilidade só pelo switch central (/api/payments/methods).
      if (!methods.length && !allowUndefined) throw new HttpError(422, "Selecione ao menos uma forma de pagamento.");
      if (enabled && !(cfg[c.keyEnc] && cfg[c.verified] && cfg[c.webhookHash])) {
        throw new HttpError(409, `Antes de ativar em ${env === "sandbox" ? "Sandbox" : "Produção"}: salve a API Key e clique em “Testar conexão” (registra o webhook).`);
      }
      const discountDays = body.discountDays === null || body.discountDays === undefined || body.discountDays === "" ? null : Number(body.discountDays);
      if (discountDays !== null && !(Number.isInteger(discountDays) && discountDays >= 0 && discountDays <= 60)) throw new HttpError(422, "Dias de desconto inválidos.");
      const discount = pct(body.discountPercent, 99);
      await save({
        enabled,
        environment: env,
        methods,
        allow_undefined: allowUndefined,
        fine_percent: pct(body.finePercent, 100),
        interest_percent: pct(body.interestPercent, 100),
        discount_percent: discount,
        discount_days: discount ? (discountDays ?? 0) : null,
        notify_asaas: body.notifyAsaas === true,
        notify_whatsapp: body.notifyWhatsapp === true,
        notify_email: body.notifyEmail === true,
      });
      const changes = [cfg.enabled !== enabled && (enabled ? "asaas_enabled" : "asaas_disabled"), cfg.environment !== env && "asaas_environment_changed"].filter(Boolean) as string[];
      for (const action of changes.length ? changes : ["asaas_settings_saved"]) {
        await audit({ actorType: "staff", actorId: operator, action, entity: "asaas_config", entityId: "1", details: { environment: env, methods, allowUndefined }, ip });
      }
      return Response.json(publicConfig(await loadAsaasConfig(db)), noStore);
    }

    // ---------- Desativar: só impede cobranças novas; histórico, IDs e webhook continuam ----------
    if (body.action === "disable") {
      await save({ enabled: false });
      await audit({ actorType: "staff", actorId: operator, action: "asaas_disabled", entity: "asaas_config", entityId: "1", details: {}, ip });
      return Response.json(publicConfig(await loadAsaasConfig(db)), noStore);
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (e) {
    return errorResponse(e);
  }
});
