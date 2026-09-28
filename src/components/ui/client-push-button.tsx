"use client";

import { BellRing, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const b64 = (key: string) =>
  Uint8Array.from(atob((key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/**
 * Cliente ativa as notificações da LOCAKAR no próprio celular (página do contrato, sem login).
 * Só aparece se o navegador suporta e o servidor tem VAPID; a permissão é pedida no clique.
 */
export function ClientPushButton({ token }: { token: string }) {
  const [state, setState] = useState<"hidden" | "off" | "on" | "busy" | "denied">("hidden");
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    fetch(`/api/push/client?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(async (j: { configured?: boolean; publicKey?: string }) => {
        if (!j.configured || !j.publicKey) return;
        setKey(j.publicKey);
        if (Notification.permission === "denied") return setState("denied");
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        setState(sub && Notification.permission === "granted" ? "on" : "off");
      })
      .catch(() => {});
  }, [token]);

  const enable = async () => {
    if (!key) return;
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
      const res = await fetch("/api/push/client", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, subscription: sub.toJSON() }) });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    }
  };

  if (state === "hidden") return null;
  return (
    <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel p-4 text-center">
      {state === "on" ? (
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <Check className="size-4" aria-hidden /> Notificações ativadas neste celular
        </p>
      ) : state === "denied" ? (
        <p className="text-sm text-zinc-400">Notificações bloqueadas neste navegador. Você continua recebendo por e-mail e WhatsApp.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-300">Receba avisos da sua locação (pagamentos, devolução, multas) direto no celular.</p>
          <Button variant="outline" onClick={enable} disabled={state === "busy"}>
            <BellRing /> {state === "busy" ? "Ativando..." : "Ativar notificações"}
          </Button>
        </>
      )}
    </div>
  );
}
