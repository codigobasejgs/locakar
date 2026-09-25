import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseEnabled } from "@/lib/supabase/env";

const LOGIN = "/admin/login";
// Arquivos do app instalável precisam abrir sem login (o navegador os busca sem cookies às vezes).
const PUBLIC_ADMIN = new Set([LOGIN, "/admin/manifest.webmanifest"]);

/**
 * Protege /admin: renova a sessão do Supabase (cookies) e redireciona para o login sem usuário válido.
 * É uma camada de UX — a segurança dos dados é garantida pelo RLS no banco.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseEnabled) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Chamar antes de gerar qualquer resposta: valida o JWT e renova tokens expirados.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  const redirect = (to: string) => {
    const res = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!signedIn && !PUBLIC_ADMIN.has(pathname)) {
    return redirect(`${LOGIN}?next=${encodeURIComponent(pathname + search)}`);
  }
  if (signedIn && pathname === LOGIN) return redirect("/admin");

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
