"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { brandTokens } from "@/lib/contrast";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import type { OrgRole, OrgStatus, Organization } from "@/types";

export interface MembershipInfo {
  organization_id: string;
  role: OrgRole;
  status: OrgStatus;
  org: Organization;
}

interface OrgContextValue {
  org: Organization | null;
  role: OrgRole | null;
  status: OrgStatus | null;
  memberships: MembershipInfo[];
  loading: boolean;
  switchOrg(orgId: string): Promise<void>;
  reload(): Promise<void>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

const DEMO_ORG: Organization = {
  id: "00000000-0000-0000-0000-000000000001",
  slug: "locakar",
  name: "LOCAKAR",
  legal_name: "LOCAKAR LOCADORA LTDA",
  document: "00000000000191",
  email: "contato@locakar.com.br",
  phone: "19989615873",
  whatsapp: "19989615873",
  website: "https://www.locakar.com.br",
  address: "Av. Principal, 100",
  city: "Campinas",
  state: "SP",
  cep: "13000-000",
  status: "active",
  branding: { displayName: "LOCAKAR", primary: "#8b008b", secondary: "#600060", accent: "#a000a0", theme: "dark" },
  texts: {},
  onboarding: {},
  created_at: new Date().toISOString(),
};

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const [org, setOrg] = useState<Organization | null>(isSupabaseEnabled ? null : DEMO_ORG);
  const [role, setRole] = useState<OrgRole | null>(isSupabaseEnabled ? null : "owner");
  const [status, setStatus] = useState<OrgStatus | null>(isSupabaseEnabled ? null : "active");
  const [memberships, setMemberships] = useState<MembershipInfo[]>([]);
  const [loading, setLoading] = useState(isSupabaseEnabled);

  const load = useCallback(async () => {
    if (!isSupabaseEnabled) return;
    try {
      const sb = getSupabase();
      const { data: m } = await sb.rpc("current_membership");
      const current = m as { organization_id: string; role: OrgRole; status: OrgStatus } | null;
      if (!current?.organization_id) return;
      const [{ data: o }, { data: mems }] = await Promise.all([
        sb.from("organizations").select("*").eq("id", current.organization_id).maybeSingle(),
        sb.from("memberships").select("organization_id, role, organizations(*)"),
      ]);
      if (o) {
        setOrg(o as Organization);
        setRole(current.role);
        setStatus(current.status);
      }
      const list: MembershipInfo[] = ((mems ?? []) as unknown as { organization_id: string; role: OrgRole; organizations: Organization }[])
        .filter((r) => r.organizations)
        .map((r) => ({ organization_id: r.organization_id, role: r.role, status: r.organizations.status, org: r.organizations }));
      setMemberships(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    load().then(() => alive);
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("locakar-org");
      channel.onmessage = () => window.location.reload();
    } catch {
      channel = null;
    }
    return () => {
      alive = false;
      channel?.close();
    };
  }, [load]);

  const switchOrg = useCallback(
    async (orgId: string) => {
      if (!isSupabaseEnabled) return;
      await getSupabase().rpc("set_active_organization", { p_org: orgId });
      // Outras abas abertas do painel recarregam na nova locadora (nunca gravam na antiga).
      try {
        new BroadcastChannel("locakar-org").postMessage(orgId);
      } catch {
        /* navegador sem BroadcastChannel: a conferência antes de gravar continua protegendo */
      }
      window.location.reload();
    },
    [],
  );

  const value = useMemo(
    () => ({ org, role, status, memberships, loading, switchOrg, reload: load }),
    [org, role, status, memberships, loading, switchOrg, load],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrganization() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrganization deve ser usado dentro de <OrganizationProvider>.");
  return ctx;
}

/** Aplica os tokens CSS de marca da locadora (cores) sobre o shell. */
export function BrandingStyle({ theme }: { theme: "dark" | "light" }) {
  const { org } = useOrganization();
  const tokens = useMemo(() => brandTokens(org?.branding, theme), [org?.branding, theme]);
  if (!tokens) return null;
  const css = Object.entries(tokens).map(([k, v]) => `${k}:${v}!important;`).join("");
  return <style dangerouslySetInnerHTML={{ __html: `:root, .admin-shell { ${css} }` }} />;
}
