import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, api, type TenantSummary } from "../services/api";
import { supabase } from "../services/supabase";
import { LocatarioContext, type TenantState } from "../hooks/useLocatario";

export function LocatarioProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<TenantState>("loading");
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<TenantSummary>("/api/tenant/summary");
      setSummary(data);
      setError(null);
      setState("ready");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return setState("unlinked");
      if (e instanceof ApiError && e.status === 401) {
        await supabase.auth.signOut();
        return setState("signed-out");
      }
      // Sem rede ou servidor fora: mantém o que já estava na tela e mostra o erro.
      setError((e as Error).message);
      setState((s) => (s === "loading" ? "ready" : s));
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) load();
      else setState("signed-out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (!next) {
        setSummary(null);
        setState("signed-out");
      } else if (event === "SIGNED_IN") {
        setState("loading");
        load();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const activeRental = useMemo(() => {
    const list = summary?.rentals ?? [];
    return list.find((r) => r.status === "active" || r.status === "late") ?? list[0] ?? null;
  }, [summary]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <LocatarioContext.Provider value={{ session, state, summary, activeRental, error, refreshing, refresh, signOut }}>
      {children}
    </LocatarioContext.Provider>
  );
}
