import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { SelsynError } from "@/lib/selsyn";
import { serverSupabase } from "./supabase";
import { serviceDb } from "./push";

export function requireCommandOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new SelsynError("INVALID_ORIGIN", "Origem não autorizada.", 403);
}

/** Senha conferida num cliente isolado; não muda cookies/sessão do painel e não retorna tokens. */
export async function reauthenticateCommand(userId: string, password: unknown) {
  if (typeof password !== "string" || password.length < 1 || password.length > 200) throw new SelsynError("REAUTH_REQUIRED", "Confirme sua senha para esta ação.", 403);
  const { data: permitted, error: limitError } = await serviceDb().rpc("reserve_selsyn_command_auth", { p_actor: userId });
  if (limitError) throw new SelsynError("DATABASE_NOT_READY", "Aplique a migration Selsyn de comandos.", 503);
  if (permitted !== true) throw new SelsynError("REAUTH_RATE_LIMITED", "Limite de confirmações atingido. Aguarde dez minutos.", 429);
  const authenticated = await serverSupabase();
  const { data: { user }, error } = await authenticated.auth.getUser();
  if (user?.factors?.some(f => f.status === "verified")) {
    const { data: assurance, error: assuranceError } = await authenticated.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== "aal2") throw new SelsynError("MFA_REQUIRED", "Confirme o segundo fator antes de operar comandos.", 403);
  }
  if (error || user?.id !== userId || !user.email) throw new SelsynError("REAUTH_REQUIRED", "Não foi possível confirmar sua identidade.", 403);
  const isolated = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const result = await isolated.auth.signInWithPassword({ email: user.email, password });
  const valid = !result.error && result.data.user?.id === userId && !!result.data.session;
  if (result.data.session) await isolated.auth.signOut({ scope: "local" }).catch(() => {});
  if (!valid) throw new SelsynError("REAUTH_FAILED", "Senha incorreta ou identidade não confirmada.", 403);
}
