import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

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

/** Garante que quem chama a API é da equipe (tabela staff). Retorna o cliente autenticado. */
export async function requireStaff() {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  const { data: staff, error } = await supabase.rpc("is_staff");
  if (error || staff !== true) throw new HttpError(403, "Sem permissão.");
  return { supabase, email: typeof data.claims.email === "string" ? data.claims.email : undefined };
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
  if (!(e instanceof HttpError)) console.error(e);
  return Response.json({ error: message }, { status });
}
