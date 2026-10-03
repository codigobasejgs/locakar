// Configurações do Supabase para a LOCAKAR.
// Aceita tanto NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY quanto NEXT_PUBLIC_SUPABASE_ANON_KEY
// com fallback direto para o projeto oficial da LOCAKAR, garantindo conexão no build da Vercel.

const DEFAULT_URL = "https://hhqtpsqcurjwnubfoeuv.supabase.co";
const DEFAULT_KEY = "sb_publishable_6lqpcj-s2Gjz7Jm2juxpFg_3bIGwzNK";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  DEFAULT_URL;

export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  DEFAULT_KEY;

export const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);
