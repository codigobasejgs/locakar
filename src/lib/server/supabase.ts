import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { can, type Permission } from "@/lib/permissions";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import type { OrgRole, OrgStatus } from "@/types";
import { currentOrg, loadOrg, setOrg } from "./org-context";

/** Cliente Supabase no servidor com a sessão do usuário (cookies). RLS continua valendo. */
export async function serverSupabase() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* Route Handler já respondeu: renovação acontece no próximo request via proxy */
        }
      },
    },
  });
}

/**
 * Garante que quem chama é da equipe de uma locadora e fixa a locadora da requisição (setOrg).
 * Locadora e papel vêm do banco (memberships + locadora ativa), nunca do request.
 * `permission`: exige a permissão do papel (ex.: "settings" só dono/administrador).
 * Locadora suspensa/cancelada: só leitura.
 */
export async function requireStaff(permission?: Permission) {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  const { data: m, error } = await supabase.rpc("current_membership");
  const membership = m as { organization_id: string; role: OrgRole; status: OrgStatus } | null;
  if (error || !membership?.organization_id) throw new HttpError(403, "Sem permissão.");
  if (permission && !can(membership.role, permission)) throw new HttpError(403, "Seu perfil não tem permissão para esta ação.");
  if (permission && permission !== "read" && (membership.status === "suspended" || membership.status === "cancelled")) {
    throw new HttpError(402, "Locadora suspensa. Regularize a assinatura para voltar a operar.");
  }
  const userId = data.claims.sub as string;
  const known = currentOrg();
  if (!known || known.org.id !== membership.organization_id) {
    const org = await loadOrg(membership.organization_id);
    if (!org) throw new HttpError(403, "Sem permissão.");
    setOrg({ org, userId, role: membership.role });
  }
  return {
    supabase,
    userId,
    orgId: membership.organization_id,
    role: membership.role,
    email: typeof data.claims.email === "string" ? data.claims.email : undefined,
  };
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(e: unknown) {
  const status = e instanceof HttpError ? e.status : 500;
  const message = e instanceof Error && (e instanceof HttpError || status < 500) ? e.message : "Erro interno ao processar o pedido.";
  if (!(e instanceof HttpError)) console.error(`[org:${currentOrg()?.org.id ?? "-"}]`, e);
  return Response.json({ error: message }, { status });
}
