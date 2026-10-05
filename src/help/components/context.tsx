"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { PLATFORM } from "@/lib/platform";
import { getSupabase } from "@/lib/supabase/client";
import { emptyProgress, progressKey, readProgress, saveProgress, type HelpProgress } from "../progress";
import type { HelpAccess } from "../types";

/** Canal real de atendimento: equipe → suporte da plataforma; locatário → WhatsApp da locadora. */
export interface HelpSupport { label: string; whatsapp: string | null; note?: string | null }

interface HelpContextValue {
  access: HelpAccess;
  base: string;
  /** Dono do progresso: conta + locadora (ou "tenant" + slug). */
  identity: { user: string; org: string; orgName: string };
  progress: HelpProgress;
  setProgress: (update: (p: HelpProgress) => HelpProgress) => void;
  support: HelpSupport;
  /** Nome da locadora (marca do tenant) para títulos; o conteúdo é o mesmo para todas. */
  brand: string | null;
  /** Chave local da pessoa + locadora (preferências no aparelho). */
  storageKey: string;
}
const Context = createContext<HelpContextValue | null>(null);
export const useHelp = () => {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("Ajuda fora do contexto.");
  return ctx;
};

export const helpStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null; // modo privado / bloqueado: progresso só em memória
  }
};

/** Progresso local por conta + locadora. Ao trocar de conta ou locadora a chave muda e o progresso é relido: nada se mistura. */
function PersonalHelp({ access, base, identity, support, brand, children }: { access: HelpAccess; base: string; identity: HelpContextValue["identity"]; support: HelpSupport; brand: string | null; children: React.ReactNode }) {
  const storageKey = progressKey(identity.user, identity.org);
  const [progress, update] = useState<HelpProgress>(emptyProgress);
  // Lê depois de montar: o HTML do servidor não conhece o localStorage (evita divergência de hidratação).
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => alive && update(readProgress(helpStorage(), storageKey)));
    return () => {
      alive = false;
    };
  }, [storageKey]);
  const setProgress = useCallback(
    (fn: (p: HelpProgress) => HelpProgress) =>
      update((p) => {
        const next = fn(p);
        saveProgress(helpStorage(), storageKey, next);
        return next;
      }),
    [storageKey],
  );
  return <Context.Provider value={{ access, base, identity, progress, setProgress, support, brand, storageKey }}>{children}</Context.Provider>;
}

const PLATFORM_SUPPORT: HelpSupport = { label: `Suporte ${PLATFORM.shortName}`, whatsapp: PLATFORM.whatsapp.e164 };

/** Painel: perfil vem da locadora ativa; enquanto carrega, role null = só o que não exige permissão (nada). */
export function AdminHelpProvider({ children }: { children: React.ReactNode }) {
  const { org, role } = useOrganization();
  const [session, setSession] = useState<{ id: string; platformAdmin: boolean; modules?: Record<string, boolean> }>({ id: "anon", platformAdmin: false });
  useEffect(() => {
    let alive = true;
    const db = getSupabase();
    Promise.all([
      db.auth.getClaims(),
      db.rpc("is_platform_admin"),
      org?.id ? db.from("subscriptions").select("plans(entitlements)").eq("organization_id", org.id).maybeSingle() : Promise.resolve({ data: null }),
    ])
      .then(([claims, platform, sub]) => {
        if (!alive) return;
        const plan = (sub.data as { plans?: { entitlements?: { modules?: Record<string, boolean> } } } | null)?.plans;
        setSession({ id: String(claims.data?.claims?.sub ?? "anon"), platformAdmin: platform.data === true, modules: plan?.entitlements?.modules });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [org?.id]);
  return (
    <PersonalHelp
      identity={{ user: session.id, org: org?.id ?? "none", orgName: org?.branding?.displayName || org?.name || "" }}
      base="/admin/ajuda"
      access={{ audience: "admin", role, platformAdmin: session.platformAdmin, modules: session.modules }}
      support={PLATFORM_SUPPORT}
      brand={org?.branding?.displayName || org?.name || null}
    >
      {children}
    </PersonalHelp>
  );
}

/** Locatário: só conteúdo público do locatário. O slug apenas separa o progresso local por locadora. */
export function TenantHelpProvider({ slug, children }: { slug: string; children: React.ReactNode }) {
  // Marca e WhatsApp públicos da locadora (mesma rota usada pelo app). Sem slug válido: sem canal.
  const [org, setOrg] = useState<{ name: string; whatsapp: string | null; support: string | null } | null>(null);
  useEffect(() => {
    if (slug === "geral") return;
    let alive = true;
    fetch(`/api/public/org/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && d && setOrg({ name: d.name, whatsapp: d.whatsapp ? String(d.whatsapp).replace(/\D/g, "") : null, support: d.support ?? null }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);
  const whatsapp = org?.whatsapp ? (org.whatsapp.length <= 11 ? `55${org.whatsapp}` : org.whatsapp) : null;
  return (
    <PersonalHelp
      key={slug}
      identity={{ user: "tenant", org: slug, orgName: org?.name ?? "" }}
      base="/ajuda"
      access={{ audience: "tenant", role: null, platformAdmin: false }}
      support={{ label: org ? `Atendimento ${org.name}` : "Atendimento da locadora", whatsapp, note: org?.support }}
      brand={org?.name ?? null}
    >
      {children}
    </PersonalHelp>
  );
}
