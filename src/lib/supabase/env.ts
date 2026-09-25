// Acesso literal a process.env: o Next injeta NEXT_PUBLIC_* em tempo de build.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Sem as variáveis, o painel roda em modo demonstração (localStorage, sem login). */
export const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);
