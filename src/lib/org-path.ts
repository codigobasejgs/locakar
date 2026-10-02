"use client";

import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/env";

let cached: Promise<string | null> | undefined;

/**
 * Caminho de Storage na pasta da locadora ativa (`{orgId}/...`). A policy do bucket confere
 * que a pasta é da locadora do usuário — não basta o nome: o banco valida.
 */
export async function orgPath(path: string) {
  if (!isSupabaseEnabled) return path;
  cached ??= Promise.resolve(getSupabase().rpc("current_org_id")).then(({ data }) => (data as string | null) ?? null);
  const org = await cached;
  if (!org) throw new Error("Locadora não identificada. Entre novamente.");
  return `${org}/${path.replace(/^\/+/, "")}`;
}
