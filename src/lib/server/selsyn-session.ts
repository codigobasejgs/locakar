import "server-only";
import { randomUUID } from "node:crypto";
import { SelsynError } from "../selsyn";
import { encrypt, decrypt, hasSecretKey } from "./secret";
import { requireOrg } from "./org-context";
import { serviceDb } from "./push";

const KEY = "SELSYN_ENCRYPTION_KEY";
export const SELSYN_PORTAL = "https://rastreame.com.br";
interface SessionRow {
  organization_id: string; login_enc: string | null; access_token_enc: string | null; refresh_token_enc: string | null;
  access_expires_at: string | null; login_expires_at: string | null; namespace: string | null;
  state: string; revision: number; last_error: string | null;
}
export interface PortalSession { accessToken: string; refreshToken: string; accessExpiresAt: string; loginExpiresAt: string }

/** Protocolo literal observado no JS público do portal. Latin1 equivalente ao btoa, sem normalizar senha. */
export function portalAuthorization(login: string, secret: string) {
  if (!login || login.length > 200 || !secret || secret.length > 8000 || /[\r\n]/.test(login + secret)) throw new SelsynError("INVALID_AUTH_INPUT", "Login ou credencial inválidos.");
  const value = `${login}&#58;${secret}&#58;${SELSYN_PORTAL}`;
  if ([...value].some(c => c.charCodeAt(0) > 255)) throw new SelsynError("INVALID_AUTH_INPUT", "O protocolo do portal não aceita caracteres fora de Latin1.");
  return Buffer.from(value, "latin1").toString("base64");
}

export function parsePortalSession(raw: unknown, now = Date.now()): PortalSession {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SelsynError("SESSION_RESPONSE_UNSUPPORTED", "Resposta de sessão desconhecida; nenhum token foi armazenado.", 424);
  const r = raw as Record<string, unknown>;
  const token = (v: unknown) => typeof v === "string" && v.length >= 10 && v.length <= 8000 && !/[\s"']/.test(v) ? v : null;
  // ponytail: aceita datas ISO com fuso explícito; outro formato exige evidência real, não adivinhar segundos/ms.
  const expires = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)) && Date.parse(v) > now ? new Date(v).toISOString() : null;
  const accessToken = token(r.accessToken), refreshToken = token(r.refreshToken);
  const accessExpiresAt = expires(r.accessTokenExpireAt), loginExpiresAt = expires(r.loginExpireAt);
  if (!accessToken || !refreshToken || !accessExpiresAt || !loginExpiresAt || Date.parse(accessExpiresAt) > Date.parse(loginExpiresAt)) throw new SelsynError("SESSION_RESPONSE_UNSUPPORTED", "Tokens ou expirações não conferem com o formato validado. Reconfigure a sessão após verificar o contrato real.", 424);
  return { accessToken, refreshToken, accessExpiresAt, loginExpiresAt };
}

/** Só autentica/renova sessão; nunca envia comandos nem utiliza cookies do navegador. */
export async function authenticatePortal(kind: "login" | "refresh", login: string, secret: string, send: typeof fetch = fetch): Promise<PortalSession> {
  const authorization = portalAuthorization(login, secret);
  const path = kind === "login" ? "/auth/rest/login/v2/keek/America@Recife" : "/auth/rest/login/v2/refresh/?versao=2000";
  try {
    const res = await send(SELSYN_PORTAL + path, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", authorization }, signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store" });
    const reader = res.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 64000) { await reader.cancel(); throw new SelsynError("SESSION_RESPONSE_UNSUPPORTED", "Resposta da sessão excedeu o limite.", 424); }
      chunks.push(value);
    }
    if (res.status === 401 || res.status === 403) throw new SelsynError("SESSION_AUTH_FAILED", "O portal recusou a autenticação. Confira a nova credencial e permissão da conta.", 424, res.status);
    if (!res.ok) throw new SelsynError("SESSION_UNAVAILABLE", "Não foi possível autenticar no portal. Reconecte manualmente; nenhuma ação foi reenviada.", 424, res.status);
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new SelsynError("SESSION_RESPONSE_UNSUPPORTED", "Resposta de sessão não é JSON válido.", 424); }
    return parsePortalSession(raw);
  } catch (e) {
    if (e instanceof SelsynError) throw e;
    throw new SelsynError("SESSION_ROTATION_UNCERTAIN", "Sem confirmação da autenticação/renovação. Reconecte manualmente; o refresh token não será repetido.", 503);
  }
}

export async function loadSelsynSession(): Promise<SessionRow | null> {
  const { data, error } = await serviceDb().from("selsyn_session").select("*").maybeSingle();
  if (error) throw new SelsynError("SESSION_DATABASE_NOT_READY", "Aplique a migration 20261021000000_selsyn_session.sql.", 503);
  return data as SessionRow | null;
}
export function publicSelsynSession(row: SessionRow | null) {
  return { configured: !!row?.login_enc, connected: row?.state === "connected", state: row?.state ?? "disconnected", accessExpiresAt: row?.access_expires_at ?? null, loginExpiresAt: row?.login_expires_at ?? null, namespace: row?.namespace ?? null, lastError: row?.last_error ?? null, encryptionReady: hasSecretKey(KEY) };
}

async function rotate(kind: "login" | "refresh", login?: string, secret?: string, namespace?: string | null) {
  if (!hasSecretKey(KEY)) throw new SelsynError("SESSION_KEY_REQUIRED", "Configure SELSYN_ENCRYPTION_KEY (32 bytes) no servidor.", 409);
  const db = serviceDb(), org = requireOrg().org.id, lease = randomUUID();
  const { data: reservation, error } = await db.rpc("acquire_selsyn_session", { p_org: org, p_lease: lease, p_connect: kind === "login" });
  if (error) throw new SelsynError("SESSION_DATABASE_NOT_READY", "Não foi possível reservar a sessão Selsyn.", 503);
  if (reservation?.result === "busy") throw new SelsynError("SESSION_BUSY", "Outra conexão/renovação está em andamento. Aguarde; nenhum token foi repetido.", 409);
  if (reservation?.result === "fresh") return loadSelsynSession();
  if (reservation?.result !== "acquired") throw new SelsynError("SESSION_REAUTH_REQUIRED", "Reconecte a conta Rastreame em Configurações. A sessão anterior não pode ser reutilizada.", 409);
  let row: SessionRow | null = null;
  try {
    row = await loadSelsynSession();
    const account = kind === "login" ? login! : row?.login_enc ? decrypt(row.login_enc, KEY) : "";
    const credential = kind === "login" ? secret! : row?.refresh_token_enc ? decrypt(row.refresh_token_enc, KEY) : "";
    const session = await authenticatePortal(kind, account, credential);
    const { data: saved, error: saveError } = await db.rpc("finish_selsyn_session", { p_org: org, p_lease: lease, p_revision: reservation.revision, p_login: encrypt(account, KEY), p_access: encrypt(session.accessToken, KEY), p_refresh: encrypt(session.refreshToken, KEY), p_access_expires: session.accessExpiresAt, p_login_expires: session.loginExpiresAt, p_namespace: kind === "login" ? namespace ?? null : row?.namespace ?? null, p_error: null });
    if (saveError || saved !== true) throw new SelsynError("SESSION_ROTATION_UNCERTAIN", "Sessão mudou ou não foi persistida após rotação. Reconecte; não repetir o token antigo.", 503);
    return loadSelsynSession();
  } catch (e) {
    await db.rpc("finish_selsyn_session", { p_org: org, p_lease: lease, p_revision: reservation.revision, p_login: null, p_access: null, p_refresh: null, p_access_expires: null, p_login_expires: null, p_namespace: null, p_error: e instanceof SelsynError ? e.code : "SESSION_ROTATION_UNCERTAIN" });
    throw e instanceof SelsynError ? e : new SelsynError("SESSION_REAUTH_REQUIRED", "Não foi possível recuperar a sessão. Reconecte com uma nova autenticação.", 409);
  }
}
export async function connectSelsynSession(login: string, password: string, namespace: string | null) {
  portalAuthorization(login, password);
  if (namespace && !/^[A-Za-z0-9_.-]{1,120}$/.test(namespace)) throw new SelsynError("INVALID_NAMESPACE", "Identificador da base inválido. Use somente o valor da base autorizado pela conta.");
  return publicSelsynSession(await rotate("login", login, password, namespace));
}
export async function disconnectSelsynSession() {
  const { error } = await serviceDb().rpc("disconnect_selsyn_session", { p_org: requireOrg().org.id });
  if (error) throw new SelsynError("SESSION_DATABASE_NOT_READY", "Não foi possível desconectar a sessão.", 503);
}
/** Não persiste senha Selsyn: refresh token é suficiente; reconexão exige ação explícita. */
export async function selsynExecutionCredentials(): Promise<{ token: string; namespace: string | null; portal: boolean }> {
  let row = await loadSelsynSession();
  if (!row) {
    const token = process.env.SELSYN_ACCESS_TOKEN;
    if (token) return { token, namespace: process.env.SELSYN_NAMESPACE ?? null, portal: false };
    throw new SelsynError("SESSION_REQUIRED", "Conecte a conta Rastreame em Configurações → Integrações → Selsyn.", 409);
  }
  if (row.state !== "connected") throw new SelsynError("SESSION_REAUTH_REQUIRED", "Sessão desconectada ou incerta. Reconecte a conta Rastreame em Configurações.", 409);
  if (!row.login_expires_at || Date.parse(row.login_expires_at) <= Date.now()) throw new SelsynError("SESSION_EXPIRED", "A sessão Rastreame expirou. Reconecte em Configurações.", 409);
  if (!row.access_expires_at || Date.parse(row.access_expires_at) <= Date.now() + 60000) row = await rotate("refresh");
  if (!row?.access_token_enc || row.state !== "connected") throw new SelsynError("SESSION_REAUTH_REQUIRED", "Reconecte a conta Rastreame.", 409);
  try { return { token: decrypt(row.access_token_enc, KEY), namespace: row.namespace, portal: true }; }
  catch { throw new SelsynError("SESSION_KEY_REQUIRED", "Não foi possível decifrar a sessão. Confira a chave do servidor e reconecte.", 409); }
}
