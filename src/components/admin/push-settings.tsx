"use client";

import { BellOff, BellRing, Send, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { needsInstallOnIos, webPushService, type PushStatus } from "@/lib/web-push";

const STATUS: Record<PushStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral"; text: string }> = {
  on: { label: "Ativadas", tone: "success", text: "Este navegador recebe as notificações do painel, mesmo com a aba fechada." },
  off: { label: "Desativadas", tone: "neutral", text: "Este navegador ainda não recebe notificações. Ative para ser avisado de locações, pagamentos, vencimentos e mais." },
  denied: {
    label: "Bloqueadas pelo navegador",
    tone: "danger",
    text: "As notificações foram bloqueadas. Libere em: cadeado ao lado do endereço → Notificações → Permitir. Depois recarregue a página.",
  },
  unsupported: { label: "Não suportado", tone: "warning", text: "Este navegador não suporta Web Push." },
  "not-configured": { label: "Não configurado", tone: "warning", text: "O servidor ainda não tem as chaves VAPID. Cadastre VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT na Vercel." },
};

/** Estado do Web Push NESTE navegador (permissão + inscrição). Cada dispositivo ativa separadamente. */
export function PushSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSupabaseEnabled) return;
    webPushService.status().then(setStatus, () => setStatus("off"));
  }, []);

  const run = async (fn: () => Promise<PushStatus | void>, ok?: string) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next) setStatus(next);
      if (next === "denied") toast.error("Permissão negada. Libere as notificações nas configurações do navegador.");
      else if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  if (!isSupabaseEnabled) return <p className="text-sm text-muted sm:col-span-2">Web Push disponível com o banco de dados conectado.</p>;
  if (!status) return <div className="h-20 animate-pulse rounded-xl bg-white/[0.04] sm:col-span-2" aria-busy="true" aria-label="Carregando" />;

  const info = STATUS[status];
  const ios = status === "unsupported" && needsInstallOnIos();

  return (
    <div className="space-y-3 rounded-xl border border-line p-4 sm:col-span-2">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {status === "on" ? <BellRing className="size-4 text-emerald-300" aria-hidden /> : status === "denied" ? <ShieldAlert className="size-4 text-red-300" aria-hidden /> : <BellOff className="size-4 text-zinc-400" aria-hidden />}
        Notificações neste dispositivo <Badge tone={info.tone}>{info.label}</Badge>
      </p>
      <p className="text-sm text-zinc-300">
        {ios ? "No iPhone/iPad, instale o app (Compartilhar → Adicionar à Tela de Início), abra por ele e ative aqui." : info.text}
      </p>
      <div className="flex flex-wrap gap-2">
        {status === "off" && (
          <Button onClick={() => run(webPushService.subscribe, "Notificações ativadas neste dispositivo.")} disabled={busy}>
            <BellRing /> Ativar notificações
          </Button>
        )}
        {status === "on" && (
          <>
            <Button variant="outline" onClick={() => run(() => webPushService.test().then(() => undefined), "Notificação de teste enviada.")} disabled={busy}>
              <Send /> Enviar teste
            </Button>
            <Button variant="ghost" onClick={() => run(webPushService.unsubscribe, "Notificações desativadas neste dispositivo.")} disabled={busy}>
              <BellOff /> Desativar neste dispositivo
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
