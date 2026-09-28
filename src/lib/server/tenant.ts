import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { HttpError } from "./supabase";

/**
 * Autenticação do App do Locatário: o app envia o token do Supabase em `Authorization: Bearer`.
 * O cliente vem do banco (clients.user_id = usuário do token), nunca de um id enviado pelo app.
 * As consultas usam a sessão do próprio locatário: o RLS do banco limita tudo aos dados dele.
 */
export async function requireTenant(request: Request): Promise<{ db: SupabaseClient; userId: string; clientId: string }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  // Vincula a conta ao cadastro da LOCAKAR se ainda não estiver (exige e-mail confirmado e igual ao cadastro).
  const { data: clientId } = await db.rpc("link_current_user_to_client");
  if (!clientId) throw new HttpError(403, "Sua conta ainda não está vinculada a um cadastro da LOCAKAR.");
  return { db, userId: data.user.id, clientId: clientId as string };
}

/** CORS do app: builds nativos não enviam Origin; no navegador (Expo web) libera só localhost. */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}
