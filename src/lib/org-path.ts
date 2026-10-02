"use client";

import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/env";

/**
 * Locadora FIXADA nesta aba do painel (a que estava ativa quando os dados foram carregados).
 * A locadora ativa fica no banco por usuário: se a pessoa trocar de locadora em outra aba, esta aba
 * passaria a gravar na outra sem perceber. Por isso toda gravação confere antes (assertSameOrg) e os
 * novos registros levam o id fixado — o banco recusa se não for a locadora ativa.
 */
let pinned: string | null = null;

export class OrgChangedError extends Error {
  constructor() {
    super("Você trocou de locadora em outra aba. Esta página será recarregada para mostrar a locadora atual.");
  }
}

export async function currentOrgId(): Promise<string | null> {
  if (!isSupabaseEnabled) return null;
  const { data } = await getSupabase().rpc("current_org_id");
  return (data as string | null) ?? null;
}

/** Chamado ao carregar o painel: fixa a locadora desta aba. */
export async function pinOrg(): Promise<string | null> {
  pinned = await currentOrgId();
  return pinned;
}

export const pinnedOrg = () => pinned;

/** Antes de gravar: a locadora ativa ainda é a desta aba? Se não, recarrega em vez de gravar na errada. */
export async function assertSameOrg() {
  if (!isSupabaseEnabled) return;
  const now = await currentOrgId();
  if (!pinned || now !== pinned) {
    if (typeof window !== "undefined") setTimeout(() => window.location.reload(), 1500);
    throw new OrgChangedError();
  }
}

/** Caminho de Storage na pasta da locadora desta aba (`{orgId}/...`); a policy do bucket confere. */
export async function orgPath(path: string) {
  if (!isSupabaseEnabled) return path;
  await assertSameOrg();
  return `${pinned}/${path.replace(/^\/+/, "")}`;
}
