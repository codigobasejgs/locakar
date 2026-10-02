import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, api, type TenantSummary } from "../services/api";
import { clearCache, readCache, writeCache } from "../services/cache";
import { registerDevice, unregisterDevice } from "../services/device";
import { supabase } from "../services/supabase";
import { LocatarioContext, type TenantState } from "../hooks/useLocatario";
import { setOrgSlug } from "../services/org";
import { useOrg } from "./OrgProvider";

/** Tabelas que a equipe altera e o app mostra: mudou, a tela recarrega sozinha (Supabase Realtime + RLS). */
const LIVE_TABLES = ["payment_receipts", "vehicle_incidents", "tenant_documents", "tenant_inspections"];

export function LocatarioProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<TenantState>("loading");
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  // Aumenta a cada evento em tempo real: telas com dados próprios (useApi) recarregam.
  const [version, setVersion] = useState(0);
  const registered = useRef(false);
  const { applyBrand } = useOrg();

  const load = useCallback(async () => {
    try {
      const data = await api<TenantSummary>("/api/tenant/summary");
      setSummary(data);
      // O servidor confirma a locadora do cliente: marca e endereço passam a ser os dela.
      if (data.brand) {
        applyBrand({ ...data.brand, whatsapp: data.support.whatsapp, email: data.support.email ?? null, support: data.support.text ?? null, active: true });
        await setOrgSlug(data.brand.slug);
      }
      setError(null);
      setOffline(false);
      setState("ready");
      writeCache("summary", data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) return setState("unlinked");
      if (e instanceof ApiError && e.status === 401) {
        await clearCache();
        await supabase.auth.signOut();
        return setState("signed-out");
      }
      // Sem rede ou servidor fora: mostra a última versão salva no aparelho, com aviso.
      const cached = await readCache<TenantSummary>("summary");
      setSummary((s) => s ?? cached);
      setOffline((e as ApiError).status === 0);
      setError((e as Error).message);
      setState((s) => (s === "loading" && cached ? "ready" : s === "loading" ? "error" : s));
    }
  }, [applyBrand]);

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
        registered.current = false;
        setState("signed-out");
      } else if (event === "SIGNED_IN") {
        setState("loading");
        load();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  // Depois do aceite de privacidade: registra o aparelho (push + segurança) uma vez por sessão.
  const consent = summary?.consent;
  useEffect(() => {
    if (state !== "ready" || !consent || registered.current) return;
    registered.current = true;
    registerDevice(consent.scopes.includes("push")).catch(() => {
      registered.current = false; // tenta de novo na próxima atualização
    });
  }, [state, consent]);

  // Tempo real: aprovação de comprovante, resposta de ocorrência, documento conferido...
  const clientId = summary?.client.id;
  useEffect(() => {
    if (!clientId) return;
    const channel = supabase.channel(`locatario-${clientId}`);
    for (const table of LIVE_TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `client_id=eq.${clientId}` }, () => {
        setVersion((v) => v + 1);
        load();
      });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setVersion((v) => v + 1);
    setRefreshing(false);
  }, [load]);

  const activeRental = useMemo(() => {
    const list = summary?.rentals ?? [];
    return list.find((r) => r.status === "active" || r.status === "late") ?? list.find((r) => r.status === "pending") ?? list[0] ?? null;
  }, [summary]);

  const signOut = useCallback(async () => {
    await unregisterDevice(); // antes de sair: precisa do token para parar o push deste aparelho
    await clearCache();
    await supabase.auth.signOut();
  }, []);

  return (
    <LocatarioContext.Provider value={{ session, state, summary, activeRental, error, offline, refreshing, version, refresh, signOut }}>
      {children}
    </LocatarioContext.Provider>
  );
}
