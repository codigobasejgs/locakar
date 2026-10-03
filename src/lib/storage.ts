/** Wrapper seguro de localStorage (SSR, modo privado e cota cheia não quebram a aplicação). */
const PREFIX = "locakar:v1:";

export const storage = {
  get<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  /** Retorna `false` quando não foi possível persistir (cota, bloqueio) para o chamador avisar o usuário. */
  set<T>(key: string, value: T): boolean {
    if (typeof window === "undefined") return false;
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  clearAll(): void {
    if (typeof window === "undefined") return;
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* armazenamento indisponível: nada a limpar */
    }
  },
};
