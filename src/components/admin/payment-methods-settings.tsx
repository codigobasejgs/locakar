"use client";

import { CreditCard, Landmark, Loader2, QrCode, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PAYMENT_METHODS, STATUS_LABEL, type PaymentMethodId, type PaymentMethodState } from "@/lib/payment-methods";
import { cn } from "@/lib/utils";

type Method = PaymentMethodState & { open: number };
const ICON: Record<PaymentMethodId, typeof Landmark> = { asaas: Landmark, infinitepay: CreditCard, pix_manual: QrCode };
const SECTION: Record<PaymentMethodId, string> = { asaas: "config-asaas", infinitepay: "config-infinitepay", pix_manual: "config-pix" };
const TONE = { active: "success", inactive: "neutral", not_configured: "warning", error: "danger" } as const;
/** Avisa as outras seções (ex.: Asaas) que a disponibilidade mudou. */
export const METHODS_EVENT = "locakar:payment-methods";

async function api(body?: { method: PaymentMethodId; enabled: boolean }): Promise<{ methods: Method[] }> {
  const res = await fetch("/api/payments/methods", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível alterar o meio de pagamento.");
  return json;
}

const goTo = (id: PaymentMethodId) => document.getElementById(SECTION[id])?.scrollIntoView({ behavior: "smooth", block: "start" });

/**
 * Configurações → Meios de pagamento. Cada switch grava no servidor (fonte de verdade) e só muda depois do sucesso.
 * `onToggled` mantém o rascunho da página igual ao banco (o "Salvar alterações" não desfaz o switch).
 */
export function PaymentMethodsSettings({ onToggled }: { onToggled: (id: PaymentMethodId, enabled: boolean) => void }) {
  const [methods, setMethods] = useState<Method[] | null>(null);
  const [busy, setBusy] = useState<PaymentMethodId | null>(null);
  const [confirm, setConfirm] = useState<Method | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api().then((r) => setMethods(r.methods), (e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(METHODS_EVENT, load);
    return () => window.removeEventListener(METHODS_EVENT, load);
  }, [load]);

  const apply = async (m: Method, enabled: boolean) => {
    if (busy) return;
    setBusy(m.id);
    try {
      const r = await api({ method: m.id, enabled });
      setMethods(r.methods);
      onToggled(m.id, enabled);
      window.dispatchEvent(new Event(METHODS_EVENT));
      toast.success(enabled ? "Meio de pagamento ativado." : "Meio de pagamento desativado.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };
  const toggle = (m: Method) => {
    if (m.enabled) return m.open > 0 ? setConfirm(m) : apply(m, false);
    if (!m.configured) {
      toast.error("Configure este meio de pagamento antes de ativá-lo.", { action: { label: "Configurar agora", onClick: () => goTo(m.id) } });
      return goTo(m.id);
    }
    apply(m, true);
  };

  if (error && !methods) return <p className="text-sm text-red-400 sm:col-span-2">{error}</p>;
  if (!methods) return <p className="text-sm text-muted sm:col-span-2">Carregando…</p>;
  const active = methods.filter((m) => m.status === "active").length;

  return (
    <>
      <div className="grid gap-3 sm:col-span-2 md:grid-cols-3">
        {methods.map((m) => {
          const Icon = ICON[m.id];
          const info = PAYMENT_METHODS[m.id];
          const on = m.enabled && m.configured;
          return (
            <div key={m.id} className={cn("flex flex-col gap-3 rounded-2xl border p-4 transition-colors", on ? "border-magenta/40 bg-magenta/5" : "border-line bg-surface")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-magenta/15 text-brand-soft"><Icon className="size-4" aria-hidden /></span>
                  <p className="font-display font-semibold">{info.label}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={m.enabled}
                  aria-label={`${m.enabled ? "Desativar" : "Ativar"} ${info.label}`}
                  disabled={busy !== null}
                  onClick={() => toggle(m)}
                  className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta disabled:opacity-60", m.enabled ? "bg-magenta" : "bg-zinc-500/40")}
                >
                  <span className={cn("grid size-5 place-items-center rounded-full bg-white shadow transition-transform", m.enabled ? "translate-x-5" : "translate-x-0.5")}>
                    {busy === m.id && <Loader2 className="size-3 animate-spin text-zinc-500" aria-hidden />}
                  </span>
                </button>
              </div>
              <p className="text-xs text-muted">{info.description}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                <Badge tone={TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                <Button size="sm" variant="ghost" onClick={() => goTo(m.id)}><Settings2 /> Configurar</Button>
              </div>
              {(m.status === "not_configured" || m.status === "error") && m.detail && <p className="text-xs text-amber-300">{m.detail}</p>}
              {m.enabled && !m.configured && <p className="text-xs text-amber-300">Ligado, mas indisponível aos clientes até concluir a configuração.</p>}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted sm:col-span-2">
        {active ? `${active} meio(s) disponível(is) para os clientes.` : "Nenhum meio ativo: o cliente verá “Não há meios de pagamento online disponíveis no momento.”"} Desativar só impede novas cobranças — pagamentos, comprovantes e webhooks já existentes continuam sendo processados.
      </p>

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && !busy && setConfirm(null)}
        title={`Desativar ${confirm ? PAYMENT_METHODS[confirm.id].label : ""}?`}
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={!!busy} onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button variant="danger" disabled={!!busy} onClick={() => confirm && apply(confirm, false)}>Desativar mesmo assim</Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Existem {confirm?.open} {confirm?.id === "pix_manual" ? "comprovante(s) aguardando análise" : "cobrança(s) aberta(s)"} utilizando este meio de pagamento. Desativá-lo impedirá seu uso em novas cobranças, mas {confirm?.id === "pix_manual" ? "os comprovantes enviados continuarão podendo ser aprovados" : "as cobranças existentes continuarão sendo processadas"}.
        </p>
      </Dialog>
    </>
  );
}
