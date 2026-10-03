import "server-only";
import { createHash, createSign } from "node:crypto";

/**
 * Integridade do App do Locatário (Android: Google Play Integrity), conferida SEMPRE no servidor.
 * O app pede um token ao Google com requestHash = sha256("<installationId>:<ts>") e envia token + ts.
 * Aqui o Google decodifica o token e conferimos: pacote, hash do pedido, app reconhecido e aparelho íntegro.
 * Env (só servidor): GOOGLE_PLAY_INTEGRITY_CREDENTIALS = JSON da service account com acesso à Play Integrity API.
 * Sem a env, ou em iOS/web, o resultado é "unavailable" (pesa pouco no score e nunca bloqueia).
 * ponytail: iOS App Attest exige validar a cadeia CBOR/X.509 da Apple; entra quando houver build iOS publicado.
 */
const PACKAGE = "br.com.locakar.locatario";

export type IntegrityResult = { status: "verified" | "failed" | "unavailable"; detail: string };

export const integrityHash = (installationId: string, ts: number) => createHash("sha256").update(`${installationId}:${ts}`).digest("hex");

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

async function googleToken(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: sa.client_email, scope: "https://www.googleapis.com/auth/playintegrity", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 };
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  const jwt = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google OAuth recusou a service account.");
  return json.access_token;
}

export async function verifyIntegrity(input: { platform: string; installationId: string; token?: unknown; ts?: unknown }): Promise<IntegrityResult> {
  const creds = process.env.GOOGLE_PLAY_INTEGRITY_CREDENTIALS;
  if (input.platform !== "android" || !creds) return { status: "unavailable", detail: "verificação não configurada para esta plataforma" };
  if (typeof input.token !== "string" || typeof input.ts !== "number") return { status: "unavailable", detail: "app não enviou token de integridade" };
  if (Math.abs(Date.now() - input.ts) > 10 * 60_000) return { status: "failed", detail: "token de integridade vencido" };
  try {
    const access = await googleToken(JSON.parse(creds));
    const res = await fetch(`https://playintegrity.googleapis.com/v1/${PACKAGE}:decodeIntegrityToken`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({ integrity_token: input.token }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { status: "failed", detail: `Google recusou o token (${res.status})` };
    const { tokenPayloadExternal: p } = (await res.json()) as {
      tokenPayloadExternal?: {
        requestDetails?: { requestPackageName?: string; requestHash?: string };
        appIntegrity?: { appRecognitionVerdict?: string };
        deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
      };
    };
    if (p?.requestDetails?.requestPackageName !== PACKAGE) return { status: "failed", detail: "pacote diferente do app oficial" };
    if (p.requestDetails.requestHash !== integrityHash(input.installationId, input.ts)) return { status: "failed", detail: "token não corresponde a este aparelho" };
    if (p.appIntegrity?.appRecognitionVerdict !== "PLAY_RECOGNIZED") return { status: "failed", detail: `app não reconhecido pela Play Store (${p.appIntegrity?.appRecognitionVerdict ?? "?"})` };
    if (!p.deviceIntegrity?.deviceRecognitionVerdict?.includes("MEETS_DEVICE_INTEGRITY")) return { status: "failed", detail: "aparelho sem integridade (root, emulador ou sistema alterado)" };
    return { status: "verified", detail: "Play Integrity OK" };
  } catch (e) {
    // Falha nossa (rede, credencial): não penaliza o cliente.
    console.error("[integridade]", (e as Error).message);
    return { status: "unavailable", detail: "verificação indisponível no momento" };
  }
}
