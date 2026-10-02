import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { serviceDb } from "./push";
import { HttpError, errorResponse } from "./supabase";

export interface Tenant {
  db: SupabaseClient;
  userId: string;
  clientId: string;
  ip: string | null;
}

/**
 * Autenticação do App do Locatário: o app envia o token do Supabase em `Authorization: Bearer`.
 * O cliente vem do banco (clients.user_id = usuário do token), nunca de um id enviado pelo app.
 * As consultas usam a sessão do próprio locatário: o RLS do banco limita tudo aos dados dele.
 */
export async function requireTenant(request: Request): Promise<Tenant> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  // Garante que o usuário autenticado tenha um cliente vinculado (ou auto-cadastrado no primeiro acesso).
  let { data: clientId } = await db.rpc("ensure_client_for_current_user");
  if (!clientId) {
    const fallback = await db.rpc("link_current_user_to_client");
    clientId = fallback.data;
  }
  if (!clientId) {
    const confirmed = Boolean(data.user.email_confirmed_at);
    throw new HttpError(403, confirmed ? "Sua conta ainda não está vinculada a um cadastro. Fale com a locadora." : "Confirme seu e-mail pelo link que enviamos para liberar o acesso.");
  }
  return { db, userId: data.user.id, clientId: clientId as string, ip: clientIp(request) };
}

/** IP real de quem chamou (Vercel preenche x-forwarded-for). Nunca vem do corpo da requisição. */
export function clientIp(request: Request) {
  const raw = request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "";
  return raw.trim().slice(0, 64) || null;
}

/** CORS do app: builds nativos não enviam Origin; no navegador (Expo web) libera só localhost. */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed = Boolean(origin && (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin === "https://www.locakar.com.br" || origin === "https://locakar.com.br"));
  if (!origin || !allowed) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export const tenantOptions = (request: Request) => new Response(null, { status: 204, headers: corsHeaders(request) });

/** Rota do app: autentica o locatário, responde JSON com CORS e padroniza erros. */
export function tenantRoute(handler: (request: Request, tenant: Tenant) => Promise<unknown>) {
  return async (request: Request) => {
    const headers = corsHeaders(request);
    try {
      const out = await handler(request, await requireTenant(request));
      return Response.json(out ?? { ok: true }, { headers });
    } catch (e) {
      const res = errorResponse(e);
      Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }
  };
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Requisição inválida.");
  return body as Record<string, unknown>;
}

/** Texto do corpo: aparado e com limite de tamanho. `null` se ausente. */
export function text(v: unknown, max: number) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** Id de idempotência gerado pelo app (reenvio não duplica). */
export function requestId(v: unknown) {
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) throw new HttpError(422, "Identificador do envio inválido.");
  return v;
}

/** Caminho de arquivo enviado pelo app: precisa estar na pasta permitida, sem subir de pasta. */
export function safePath(v: unknown, prefix: string) {
  if (typeof v !== "string" || !v.startsWith(prefix) || v.includes("..") || v.length > 300 || !/^[A-Za-z0-9/_.-]+$/.test(v)) {
    throw new HttpError(422, "Arquivo inválido.");
  }
  return v;
}

/** Confere no Storage que os arquivos existem (o app sobe antes de chamar a API). */
export async function filesExist(bucket: string, paths: string[]) {
  const byFolder = new Map<string, string[]>();
  for (const p of paths) {
    const folder = p.slice(0, p.lastIndexOf("/"));
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), p.slice(p.lastIndexOf("/") + 1)]);
  }
  const storage = serviceDb().storage.from(bucket);
  for (const [folder, names] of byFolder) {
    const { data } = await storage.list(folder, { limit: 100 });
    const found = new Set((data ?? []).map((f) => f.name));
    if (names.some((n) => !found.has(n))) return false;
  }
  return true;
}

/** Trilha de auditoria (quem, o quê, de onde). Nunca lança: auditoria não derruba a operação. */
export async function audit(entry: {
  actorType: "client" | "staff" | "system";
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  ip?: string | null;
}) {
  if (!process.env.SUPABASE_SECRET_KEY) return;
  const { error } = await serviceDb()
    .from("audit_log")
    .insert({
      actor_type: entry.actorType,
      actor_id: entry.actorId ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? {},
      ip_address: entry.ip ?? null,
    });
  if (error) console.error("[auditoria]", error.message);
}
