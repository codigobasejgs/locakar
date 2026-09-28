import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { TenantRental, TenantSummary } from "../services/api";

export type TenantState =
  | "loading" // verificando sessão
  | "signed-out" // sem login
  | "unlinked" // logado, mas a conta não está ligada a um cadastro da LOCAKAR
  | "ready"; // dados carregados

interface LocatarioContextValue {
  session: Session | null;
  state: TenantState;
  summary: TenantSummary | null;
  /** Locação em andamento (ativa ou atrasada), senão a mais recente. */
  activeRental: TenantRental | null;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const LocatarioContext = createContext<LocatarioContextValue | null>(null);

export function useLocatario() {
  const ctx = useContext(LocatarioContext);
  if (!ctx) throw new Error("useLocatario deve ser usado dentro de <LocatarioProvider>.");
  return ctx;
}
