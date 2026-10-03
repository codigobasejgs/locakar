"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import type { AppNotification } from "@/types";

const LIMIT = 50;

/**
 * Central de notificações da equipe (tabela `notifications` + leituras por pessoa).
 * Atualiza ao focar a janela, a cada 60s e quando chega um push com o painel aberto.
 */
export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseEnabled) return setLoaded(true);
    const db = getSupabase();
    const { data: claims } = await db.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) return;
    // Defesa extra além do RLS: só a locadora ativa (quem participa de várias não mistura avisos).
    const { data: orgId } = await db.rpc("current_org_id");
    if (!orgId) return setItems([]);
    const [{ data: rows }, { data: reads }] = await Promise.all([
      db.from("notifications").select("id,type,category,severity,title,body,url,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(LIMIT),
      db.from("notification_reads").select("notification_id,read_at").eq("user_id", userId),
    ]);
    const readAt = new Map((reads ?? []).map((r) => [r.notification_id as string, r.read_at as string]));
    setItems(
      (rows ?? []).map((r) => ({
        id: r.id,
        type: r.type,
        category: r.category,
        severity: r.severity,
        title: r.title,
        body: r.body,
        url: r.url,
        createdAt: r.created_at,
        readAt: readAt.get(r.id),
      })),
    );
    setLoaded(true);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => alive && load().catch(() => {});
    tick();
    const id = setInterval(tick, 60_000);
    // Trocou de conta (login/logout) sem recarregar: limpa e busca a lista da nova sessão.
    const { data: sub } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setItems([]);
        tick();
      }
    });
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const markRead = useCallback(async (ids: string[]) => {
    const unread = ids.filter((id) => items.find((n) => n.id === id && !n.readAt));
    if (!unread.length || !isSupabaseEnabled) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (unread.includes(n.id) ? { ...n, readAt: now } : n)));
    const { data: claims } = await getSupabase().auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) return;
    await getSupabase()
      .from("notification_reads")
      .upsert(unread.map((notification_id) => ({ notification_id, user_id: userId })), { onConflict: "notification_id,user_id", ignoreDuplicates: true });
  }, [items]);

  return { items, loaded, reload: load, markRead, markAllRead: () => markRead(items.map((n) => n.id)) };
}

