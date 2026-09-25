/**
 * Autenticação do painel.
 * - Com Supabase configurado: Supabase Auth (e-mail + senha). A rota /admin é protegida em `src/proxy.ts`
 *   e os dados, por RLS (só usuários da tabela `staff`).
 * - Sem Supabase: sessão de DEMONSTRAÇÃO (não protege nada, não guarda senha).
 */
import { dbErrorMessage } from "@/repositories/mapping";
import { getSupabase } from "./supabase/client";
import { isSupabaseEnabled } from "./supabase/env";

export interface AuthSession {
  email: string;
}

export interface AuthService {
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  /** Lança erro legível se o usuário logado não pertence à equipe (tabela `staff`). */
  assertAccess(): Promise<void>;
}

const DEMO_KEY = "locakar:demo-session";

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "E-mail ainda não confirmado. Confirme pelo link recebido ou peça para liberar o acesso.",
  over_request_rate_limit: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  user_banned: "Acesso bloqueado. Fale com o administrador.",
};

const supabaseAuth: AuthService = {
  async signIn(email, password) {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      // Sem status HTTP = a requisição nem chegou ao Supabase (rede, proxy, firewall).
      if (!error.status) throw new Error("Sem conexão com o servidor. Verifique sua internet e tente novamente.");
      throw new Error((error.code && AUTH_ERRORS[error.code]) || "Não foi possível entrar. Tente novamente.");
    }
    return { email: data.user.email ?? email };
  },
  async signOut() {
    await getSupabase().auth.signOut();
  },
  async getSession() {
    // getClaims valida o JWT; getSession sozinho não é confiável (docs do Supabase).
    const { data } = await getSupabase().auth.getClaims();
    const email = data?.claims?.email;
    return typeof email === "string" ? { email } : null;
  },
  async assertAccess() {
    const { data, error } = await getSupabase().rpc("is_staff");
    if (error) throw new Error(dbErrorMessage(error));
    if (data !== true) {
      throw new Error("Seu usuário ainda não tem acesso ao painel. Peça ao administrador para liberar o seu e-mail.");
    }
  },
};

const demoAuth: AuthService = {
  async signIn(email) {
    // Senha é descartada de propósito: nada é validado nem persistido.
    const session = { email: email.trim().toLowerCase() };
    try {
      sessionStorage.setItem(DEMO_KEY, JSON.stringify(session));
    } catch {
      /* sessionStorage indisponível */
    }
    return session;
  },
  async signOut() {
    try {
      sessionStorage.removeItem(DEMO_KEY);
    } catch {
      /* nada a remover */
    }
  },
  async getSession() {
    try {
      const raw = sessionStorage.getItem(DEMO_KEY);
      return raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
      return null;
    }
  },
  async assertAccess() {},
};

export const authService: AuthService = isSupabaseEnabled ? supabaseAuth : demoAuth;
