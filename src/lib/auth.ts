/**
 * Contrato de autenticação do painel. Hoje: sessão de DEMONSTRAÇÃO (não protege nada, não guarda senha).
 * Futuro: implementar com Supabase Auth (`supabase.auth.signInWithPassword`) + proteção de /admin
 * em `src/proxy.ts` e Row Level Security no banco.
 */
export interface AuthSession {
  email: string;
  signedInAt: string;
}

export interface AuthService {
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): AuthSession | null;
}

const KEY = "locakar:demo-session";

export const authService: AuthService = {
  async signIn(email) {
    // Senha é descartada de propósito: nada é validado nem persistido.
    const session = { email: email.trim().toLowerCase(), signedInAt: new Date().toISOString() };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      /* sessionStorage indisponível: segue sem persistir */
    }
    return session;
  },
  async signOut() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* nada a remover */
    }
  },
  getSession() {
    try {
      const raw = sessionStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
      return null;
    }
  },
};
