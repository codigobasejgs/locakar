"use client";

import { CheckCircle2, LogOut, RefreshCw, Send, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { COMPANY } from "@/lib/company";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { maskPhone } from "@/lib/utils";

interface Status {
  configured?: boolean;
  connected?: boolean;
  number?: string;
  profileName?: string;
  qr?: string;
  error?: string;
}

const pretty = (n?: string) => (n?.startsWith("55") ? maskPhone(n.slice(2)) : n);

/**
 * Conexão do WhatsApp da LOCAKAR: mostra o QR Code e se atualiza sozinha até conectar.
 * Enquanto desconectado busca um QR novo a cada 20s (o QR expira); conectado, confere a cada 60s.
 */
export function WhatsAppConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [testPhone, setTestPhone] = useState(maskPhone(COMPANY.whatsapp.e164.slice(2)));

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp", { cache: "no-store" });
      const json = (await res.json()) as Status;
      setStatus(res.ok ? json : { error: json.error ?? "Falha ao consultar o WhatsApp." });
    } catch {
      setStatus({ error: "Sem conexão com o servidor." });
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseEnabled) return;
    let alive = true;
    const tick = async () => alive && (await load());
    tick();
    const id = setInterval(tick, status?.connected ? 60_000 : 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [load, status?.connected]);

  const act = async (action: "logout" | "restart" | "test") => {
    setBusy(true);
    try {
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, phone: testPhone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Falha na operação.");
      if (action === "test") toast.success(`Mensagem de teste enviada para ${testPhone}.`);
      if (action === "logout") toast.success("WhatsApp desconectado.");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  if (!isSupabaseEnabled) return <p className="text-sm text-muted sm:col-span-2">Disponível com o banco de dados conectado.</p>;
  if (!status) return <div className="h-40 animate-pulse rounded-xl bg-white/[0.04] sm:col-span-2" aria-busy="true" aria-label="Carregando" />;
  if (status.error) {
    return (
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <p className="text-sm text-red-300">{status.error}</p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw /> Tentar novamente
        </Button>
      </div>
    );
  }
  if (!status.configured) {
    return (
      <p className="text-sm text-amber-300 sm:col-span-2">
        Configure EVOLUTION_API_URL e EVOLUTION_API_KEY na Vercel para ativar o WhatsApp.
      </p>
    );
  }

  if (status.connected) {
    return (
      <>
        <div className="flex items-center gap-3 sm:col-span-2">
          <CheckCircle2 className="size-8 text-emerald-300" aria-hidden />
          <div>
            <p className="flex items-center gap-2 font-medium">
              Conectado <Badge tone="success">Ativo</Badge>
            </p>
            <p className="text-sm text-muted">
              {status.profileName ? `${status.profileName} · ` : ""}
              {pretty(status.number) ?? "número conectado"}
            </p>
          </div>
        </div>
        <Field label="Enviar mensagem de teste para" htmlFor="wa-test">
          <Input id="wa-test" value={testPhone} onChange={(e) => setTestPhone(maskPhone(e.target.value))} inputMode="tel" />
        </Field>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" onClick={() => act("test")} disabled={busy}>
            <Send /> Enviar teste
          </Button>
          <Button variant="ghost" onClick={() => setConfirmLogout(true)} disabled={busy}>
            <LogOut /> Desconectar
          </Button>
        </div>
        <ConfirmDialog
          open={confirmLogout}
          onOpenChange={setConfirmLogout}
          title="Desconectar o WhatsApp?"
          description="As notificações por WhatsApp param até você escanear o QR Code novamente. Os e-mails continuam funcionando."
          confirmLabel="Desconectar"
          onConfirm={() => act("logout")}
        />
      </>
    );
  }

  return (
    <div className="grid gap-5 sm:col-span-2 md:grid-cols-[240px_1fr]">
      <div className="grid aspect-square w-full max-w-60 place-items-center rounded-xl bg-white p-3">
        {status.qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={status.qr} alt="QR Code para conectar o WhatsApp da LOCAKAR" className="size-full" />
        ) : (
          <RefreshCw className="size-8 animate-spin text-zinc-400" aria-label="Gerando QR Code" />
        )}
      </div>
      <div className="space-y-3 text-sm text-zinc-300">
        <p className="flex items-center gap-2 font-medium text-white">
          <Smartphone className="size-4 text-brand-soft" aria-hidden /> Conecte o WhatsApp da LOCAKAR <Badge tone="warning">Desconectado</Badge>
        </p>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>
            No celular com o número <strong>{COMPANY.whatsapp.display}</strong>, abra o WhatsApp.
          </li>
          <li>
            Toque em <strong>⋮ (Android)</strong> ou <strong>Configurações (iPhone)</strong> → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong>.
          </li>
          <li>Aponte a câmera para o QR Code ao lado.</li>
        </ol>
        <p className="text-xs text-muted">O QR Code se renova sozinho a cada 20 segundos. Esta tela muda para “Conectado” assim que o celular ler o código.</p>
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>
          <RefreshCw /> Gerar novo QR Code
        </Button>
      </div>
    </div>
  );
}
