import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { View } from "react-native";
import { setOrgWhatsapp } from "../constants/company";
import { API_URL } from "../services/api";
import { DEFAULT_ORG, fetchOrgBrand, initOrg, setOrgSlug, type OrgBrand } from "../services/org";

/**
 * Locadora (white label) em que o app está aberto: marca e contatos de antes do login.
 * Depois do login, o resumo do servidor confirma a locadora do cliente (summary.brand).
 */
interface OrgContextValue {
  slug: string;
  brand: OrgBrand | null;
  /** Troca de locadora (cliente com cadastro em mais de uma). */
  switchOrg: (slug: string) => Promise<void>;
  /** Atualiza a marca com a que veio do servidor após o login. */
  applyBrand: (b: Partial<OrgBrand> & { slug: string }) => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [brand, setBrand] = useState<OrgBrand | null>(null);

  useEffect(() => {
    let alive = true;
    initOrg().then(async (s) => {
      const b = await fetchOrgBrand(API_URL, s);
      if (!alive) return;
      // Link para locadora inexistente: volta para o padrão em vez de travar o app.
      if (!b && s !== DEFAULT_ORG) {
        await setOrgSlug(DEFAULT_ORG);
        setBrand(await fetchOrgBrand(API_URL, DEFAULT_ORG));
        setSlug(DEFAULT_ORG);
        return;
      }
      setBrand(b);
      setSlug(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const switchOrg = useCallback(async (next: string) => {
    await setOrgSlug(next);
    setSlug(next);
    setBrand(await fetchOrgBrand(API_URL, next));
  }, []);

  const applyBrand = useCallback((b: Partial<OrgBrand> & { slug: string }) => {
    setBrand((cur) => ({ ...(cur ?? ({} as OrgBrand)), ...b }) as OrgBrand);
  }, []);

  setOrgWhatsapp(brand?.whatsapp ?? null);
  if (!slug) return <View style={{ flex: 1, backgroundColor: "#050505" }} />;
  return <OrgContext.Provider value={{ slug, brand, switchOrg, applyBrand }}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  return ctx ?? { slug: DEFAULT_ORG, brand: null, switchOrg: async () => {}, applyBrand: () => {} };
}

/** Nome exibido da locadora (fallback LOCAKAR). */
export function useBrandName() {
  return useOrg().brand?.name || "LOCAKAR";
}
