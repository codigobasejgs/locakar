import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Sessão guardada no Keychain (iOS) / Keystore (Android). No navegador (expo web), localStorage.
 * SecureStore aceita até ~2 KB por chave: o token do Supabase é dividido em partes.
 */
const CHUNK = 1800;
const nativeStore = {
  async getItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!count) return SecureStore.getItemAsync(key);
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.every((p) => p != null) ? parts.join("") : null;
  },
  async setItem(key: string, value: string) {
    const parts = value.match(new RegExp(`.{1,${CHUNK}}`, "gs")) ?? [""];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
  },
  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    await Promise.all([key, `${key}.n`, ...Array.from({ length: count }, (_, i) => `${key}.${i}`)].map((k) => SecureStore.deleteItemAsync(k)));
  },
};

const webStore = {
  getItem: (key: string) => (typeof localStorage === "undefined" ? null : localStorage.getItem(key)),
  setItem: (key: string, value: string) => void (typeof localStorage !== "undefined" && localStorage.setItem(key, value)),
  removeItem: (key: string) => void (typeof localStorage !== "undefined" && localStorage.removeItem(key)),
};

// Valores públicos do projeto LOCAKAR (os mesmos do site). Nunca coloque chaves secretas no app.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://hhqtpsqcurjwnubfoeuv.supabase.co";
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_6lqpcj-s2Gjz7Jm2juxpFg_3bIGwzNK";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: Platform.OS === "web" ? webStore : nativeStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});
