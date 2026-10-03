import { CONSENT_SCOPES, PRIVACY_VERSION, riskLevel, riskScore } from "@/lib/antifraud";
import { verifyIntegrity } from "@/lib/server/integrity";
import { notifyStaff, serviceDb } from "@/lib/server/push";
import { HttpError } from "@/lib/server/supabase";
import { audit, readBody, tenantOptions, tenantRoute, text } from "@/lib/server/tenant";

/**
 * Aparelho do locatário: consentimento (LGPD), registro para push nativo e verificação de segurança.
 * POST { action: "consent", scopes }                          → registra o aceite da política atual
 * POST { action: "register", installationId, platform, pushToken?, deviceModel?, osVersion?, appVersion?,
 *        isEmulator?, integrityToken?, integrityTs? }        → grava aparelho + telemetria + score
 * POST { action: "unregister", installationId }              → desativa o push deste aparelho (logout)
 * O IP vem do servidor. O score é visível só para a equipe e nunca bloqueia o cliente.
 * O que é coletado está descrito na tela de privacidade do app (sem localização, contatos ou arquivos).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 20;
export const OPTIONS = tenantOptions;

const PLATFORMS = new Set(["ios", "android", "web"]);

export const POST = tenantRoute(async (request, { db, clientId, ip }) => {
  const body = await readBody(request);
  const admin = serviceDb();

  if (body.action === "consent") {
    const scopes = (Array.isArray(body.scopes) ? body.scopes : []).filter((s): s is string => (CONSENT_SCOPES as readonly string[]).includes(s as string));
    if (!scopes.includes("essential") || !scopes.includes("security_telemetry")) throw new HttpError(422, "Aceite os termos obrigatórios para usar o app.");
    const { error } = await db.from("tenant_consents").insert({ client_id: clientId, policy_version: PRIVACY_VERSION, scopes, ip_address: ip });
    if (error) throw new HttpError(500, "Não foi possível registrar o aceite.");
    await audit({ actorType: "client", actorId: clientId, action: "consent.accepted", entity: "tenant_consents", details: { version: PRIVACY_VERSION, scopes }, ip });
    return { ok: true };
  }

  const installationId = typeof body.installationId === "string" && /^[A-Za-z0-9-]{8,80}$/.test(body.installationId) ? body.installationId : null;
  if (!installationId) throw new HttpError(422, "Aparelho inválido.");

  if (body.action === "unregister") {
    await admin.from("tenant_devices").update({ push_token: null, active: false, updated_at: new Date().toISOString() }).eq("client_id", clientId).eq("installation_id", installationId);
    return { ok: true };
  }
  if (body.action !== "register") throw new HttpError(400, "Ação inválida.");

  // Sem aceite da política atual, nada de telemetria.
  const { data: consent } = await db.from("tenant_consents").select("policy_version,scopes").order("consented_at", { ascending: false }).limit(1).maybeSingle();
  if (consent?.policy_version !== PRIVACY_VERSION) throw new HttpError(428, "Aceite a política de privacidade para continuar.");
  const pushAllowed = (consent.scopes as string[]).includes("push");

  const platform = typeof body.platform === "string" && PLATFORMS.has(body.platform) ? body.platform : null;
  if (!platform) throw new HttpError(422, "Plataforma inválida.");
  const pushToken = pushAllowed && typeof body.pushToken === "string" && /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/.test(body.pushToken) ? body.pushToken : null;
  const now = new Date().toISOString();
  const device = {
    client_id: clientId,
    installation_id: installationId,
    platform,
    push_token: pushToken,
    device_model: text(body.deviceModel, 80),
    os_version: text(body.osVersion, 40),
    app_version: text(body.appVersion, 20),
    active: true,
    last_seen_at: now,
    updated_at: now,
  };

  const since24h = new Date(Date.now() - 86_400_000).toISOString();
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [existing, otherClients, activeDevices, ips, dupProofs, rejected, integrity] = await Promise.all([
    admin.from("tenant_devices").select("id").eq("client_id", clientId).eq("installation_id", installationId).maybeSingle(),
    admin.from("tenant_devices").select("client_id").eq("installation_id", installationId).neq("client_id", clientId),
    admin.from("tenant_devices").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("active", true).neq("installation_id", installationId),
    admin.from("antifraud_telemetry").select("ip_address").eq("client_id", clientId).gte("created_at", since24h).limit(200),
    admin.rpc("duplicate_proofs_count", { p_client_id: clientId }),
    admin.from("payment_receipts").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "rejected").gte("reviewed_at", since30d),
    verifyIntegrity({ platform, installationId, token: body.integrityToken, ts: body.integrityTs }),
  ]);

  const { error } = await admin.from("tenant_devices").upsert(device, { onConflict: "client_id,installation_id" });
  if (error) throw new HttpError(500, "Não foi possível registrar o aparelho.");
  // Mesmo token de push em outra conta (troca de login no aparelho): passa a valer só para quem está logado.
  if (pushToken) await admin.from("tenant_devices").update({ push_token: null, active: false }).eq("push_token", pushToken).neq("client_id", clientId);

  const emulator = body.isEmulator === true;
  const risk = riskScore({
    newDevice: !existing.data,
    otherClientsOnDevice: new Set((otherClients.data ?? []).map((d) => d.client_id)).size,
    activeDevices: (activeDevices.count ?? 0) + 1,
    emulator,
    integrity: integrity.status,
    distinctIps24h: new Set([...(ips.data ?? []).map((r) => r.ip_address), ip].filter(Boolean)).size,
    duplicateProofs: typeof dupProofs.data === "number" ? dupProofs.data : 0,
    rejectedProofs30d: rejected.count ?? 0,
  });

  // Uma leitura por aparelho a cada 6 h basta (abrir o app várias vezes não enche a tabela).
  const { data: recent } = await admin.from("antifraud_telemetry").select("risk_score").eq("client_id", clientId).eq("device_id", installationId).gte("created_at", new Date(Date.now() - 6 * 3_600_000).toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!recent || recent.risk_score !== risk.score) {
    await admin.from("antifraud_telemetry").insert({
      client_id: clientId,
      device_id: installationId,
      ip_address: ip,
      app_version: device.app_version,
      platform,
      os_version: device.os_version,
      device_model: device.device_model,
      is_emulator: emulator,
      integrity_status: `${integrity.status}: ${integrity.detail}`.slice(0, 200),
      risk_score: risk.score,
      risk_factors: risk.factors,
      consented: true,
    });
    // Subiu para elevado/crítico: a equipe é avisada para conferir (sem bloqueio automático).
    const level = riskLevel(risk.score);
    if ((level === "elevado" || level === "critico") && (recent?.risk_score ?? 0) < 60) {
      const { data: profile } = await db.from("tenant_profile").select("name").single();
      await notifyStaff([
        {
          type: "security.risk",
          category: "system",
          severity: level === "critico" ? "critical" : "warning",
          title: `Risco ${level === "critico" ? "crítico" : "elevado"} no app do locatário`,
          body: `${profile?.name ?? "Cliente"} · score ${risk.score}. Confira na Central de Segurança antes de agir.`,
          url: "/admin/security",
          dedupeKey: `risk:${clientId}:${installationId}:${new Date().toISOString().slice(0, 10)}`,
        },
      ]);
    }
  }
  return { ok: true, push: Boolean(pushToken) };
});
