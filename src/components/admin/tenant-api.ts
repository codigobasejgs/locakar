"use client";

/** Chamadas do painel à rota /api/tenant-admin (somente equipe). */
export async function tenantAdminGet<T>(query: string): Promise<T | null> {
  const res = await fetch(`/api/tenant-admin?${query}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json().catch(() => null)) as T | null;
}

export async function tenantAdminPost(body: Record<string, unknown>) {
  const res = await fetch("/api/tenant-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
}

export const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
