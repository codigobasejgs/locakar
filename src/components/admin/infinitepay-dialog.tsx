"use client";

import { Copy, CreditCard, ExternalLink, Link as LinkIcon, RefreshCw, Share2, Smartphone, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { TX_STATUS_LABEL, maxInstallments, methodLabel, toCents, type InfinitePaySettings, type TransactionStatus } from "@/lib/infinitepay";
import { formatCurrency } from "@/lib/utils";
import type { UnifiedPaymentItem } from "./payment-actions-sheet";

interface Tx {
  id: string;
  flow: "tap" | "checkout";
  status: TransactionStatus;
  amount_cents: number;
  method: string | null;
  installments: number | null;
  checkout_url: string | null;
  transaction_nsu: string | null;
  nsu: string | null;
  authorization_code: string | null;
  card_brand: string | null;
  receipt_url: string | null;
  warning: string | null;
  last_error: string | null;
  created_at: string;
}

async function api<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/payments/infinitepay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
  return json as T;
}

const isIOS = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const isMobile = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * Receber uma parcela pela InfinitePay: aproximação (InfiniteTap, abre o app InfinitePay neste celular)
 * ou link do Checkout (Pix/cartão). O valor mostrado é estimado; o servidor recalcula antes de cobrar.
 */
export function InfinitePayDialog({ payment, config, onClose, onPaid }: { payment: UnifiedPaymentItem | null; config: InfinitePaySettings; onClose: () => void; onPaid: () => void }) {
  const expected = payment ? (payment.lateCharges?.total ?? payment.amount) : 0;
  const cents = toCents(expected);
  const maxParcels = maxInstallments(cents);
  const tapOn = config.mode !== "checkout";
  const checkoutOn = config.mode !== "tap";
  const [flow, setFlow] = useState<"tap" | "checkout">(tapOn ? "tap" : "checkout");
  const [method, setMethod] = useState<"credit" | "debit">("credit");
  const [installments, setInstallments] = useState(1);
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [history, setHistory] = useState<Tx[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!payment) return;
    let alive = true;
    fetch(`/api/payments/infinitepay?rentalId=${encodeURIComponent(payment.rentalId)}&receiptId=${encodeURIComponent(payment.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { transactions?: Tx[] }) => {
        if (!alive) return;
        const list = j.transactions ?? [];
        setHistory(list);
        const open = list.find((t) => t.flow === "checkout" && t.status === "link_created" && t.checkout_url);
        if (open) setLink({ id: open.id, url: open.checkout_url! });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [payment]);

  if (!payment) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  const startTap = () =>
    run(async () => {
      if (!navigator.onLine) throw new Error("É necessária conexão com a internet para iniciar o pagamento.");
      if (!isMobile()) throw new Error("Para utilizar o pagamento por aproximação, abra o painel no celular com o aplicativo InfinitePay instalado.");
      const r = await api<{ deeplink: string }>({ action: "tap.start", rentalId: payment.rentalId, receiptId: payment.id, method, installments: method === "credit" ? installments : 1, ios: isIOS() });
      // Se o app InfinitePay não abrir em ~2,5s, a página continua visível: avisamos em vez de travar.
      const timer = window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          toast.error("Não foi possível iniciar o InfinitePay neste dispositivo. Para utilizar o pagamento por aproximação, instale ou configure o aplicativo InfinitePay neste dispositivo.", { duration: 8000 });
        }
      }, 2500);
      document.addEventListener("visibilitychange", () => window.clearTimeout(timer), { once: true });
      window.location.href = r.deeplink;
    });

  const createLink = () =>
    run(async () => {
      const r = await api<{ id: string; url: string; reused?: boolean }>({ action: "checkout.create", rentalId: payment.rentalId, receiptId: payment.id });
      setLink({ id: r.id, url: r.url });
      toast.success(r.reused ? "Link existente reaproveitado." : "Link criado com sucesso.");
    });

  const check = (id: string) =>
    run(async () => {
      const r = await api<{ status: string; message?: string }>({ action: "checkout.check", id });
      if (r.status === "paid") {
        toast.success("Pagamento confirmado pela InfinitePay. Parcela baixada.");
        onPaid();
        onClose();
      } else if (r.status === "amount_mismatch") toast.error("Valor pago diferente do cobrado. Confira no app InfinitePay.");
      else toast.message(r.message ?? "Pagamento ainda não confirmado.");
    });

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url).then(() => toast.success("Link copiado."), () => toast.error("Não foi possível copiar."));
  };
  const share = async () => {
    if (!link) return;
    if (navigator.share) await navigator.share({ title: "Pagamento LOCAKAR", url: link.url }).catch(() => {});
    else await copy();
  };
  const whatsapp = () => link && run(async () => {
    await api({ action: "checkout.whatsapp", id: link.id });
    toast.success(`Link enviado no WhatsApp de ${payment.clientName}.`);
  });
  const cancel = (id: string) => run(async () => {
    await api({ action: "cancel", id });
    setHistory((h) => h.map((t) => (t.id === id ? { ...t, status: "cancelled" } : t)));
    if (link?.id === id) setLink(null);
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()} title="Pagamento InfinitePay" description="Aproximação no celular ou link de pagamento (Pix e cartão)." size="md">
      <div className="grid gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
          <dt className="text-muted">Cliente</dt>
          <dd className="font-semibold text-white">{payment.clientName}</dd>
          <dt className="text-muted">Veículo</dt>
          <dd>{payment.vehiclePlate} · {payment.vehicleName}</dd>
          <dt className="text-muted">Parcela</dt>
          <dd>{payment.description}</dd>
          <dt className="text-muted">Valor</dt>
          <dd className="font-display text-lg font-bold tabular-nums text-white">
            {formatCurrency(expected)}
            {payment.lateCharges && payment.lateCharges.total > payment.amount && <span className="block text-[11px] font-normal text-red-400">inclui multa e juros</span>}
          </dd>
        </dl>

        {cents < 100 ? (
          <p className="text-sm text-red-400">O valor mínimo na InfinitePay é R$ 1,00.</p>
        ) : (
          <>
            {tapOn && checkoutOn && (
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de cobrança">
                {([["tap", "Aproximação", Smartphone], ["checkout", "Link de pagamento", LinkIcon]] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={flow === key}
                    onClick={() => setFlow(key)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${flow === key ? "border-magenta/60 bg-magenta/15 text-white" : "border-line text-muted hover:text-white"}`}
                  >
                    <Icon className="size-4" /> {label}
                  </button>
                ))}
              </div>
            )}

            {flow === "tap" ? (
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Método" htmlFor="ip-method">
                    <Select
                      id="ip-method"
                      value={method}
                      onChange={(e) => {
                        setMethod(e.target.value as "credit" | "debit");
                        setInstallments(1);
                      }}
                      options={[{ value: "credit", label: "Crédito" }, { value: "debit", label: "Débito" }]}
                    />
                  </Field>
                  <Field label="Parcelas" htmlFor="ip-inst" hint={method === "credit" ? `Até ${maxParcels}x (mín. R$ 1,00/parcela)` : "Débito é à vista"}>
                    <Select
                      id="ip-inst"
                      value={String(installments)}
                      disabled={method === "debit"}
                      onChange={(e) => setInstallments(Number(e.target.value))}
                      options={Array.from({ length: method === "credit" ? maxParcels : 1 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? "À vista" : `${i + 1}x de ${formatCurrency(expected / (i + 1))}` }))}
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted">Abre o app InfinitePay neste celular. Depois do pagamento ele volta ao painel com NSU e autorização para você confirmar a baixa.</p>
                <Button disabled={busy} onClick={startTap}>
                  <CreditCard /> {busy ? "Abrindo InfinitePay…" : "Iniciar pagamento por aproximação"}
                </Button>
              </div>
            ) : link ? (
              <div className="grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="text-sm font-semibold text-emerald-300">Link criado com sucesso.</p>
                <p className="break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-zinc-300">{link.url}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Abrir checkout</a>
                  </Button>
                  <Button variant="outline" size="sm" onClick={copy}><Copy /> Copiar link</Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={whatsapp}><WhatsAppIcon className="size-4" /> Enviar WhatsApp</Button>
                  <Button variant="outline" size="sm" onClick={share}><Share2 /> Compartilhar</Button>
                </div>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => check(link.id)}>
                  <RefreshCw /> Verificar pagamento
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                <p className="text-xs text-muted">O cliente paga com Pix ou cartão (até 12x) no ambiente da InfinitePay. A parcela é baixada sozinha quando a InfinitePay confirmar (webhook + consulta de status).</p>
                <Button disabled={busy} onClick={createLink}>
                  <LinkIcon /> {busy ? "Gerando link…" : "Gerar link de pagamento"}
                </Button>
              </div>
            )}
          </>
        )}

        {history.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Tentativas nesta parcela</p>
            <ul className="grid gap-2">
              {history.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-white">
                      {methodLabel(t.flow, t.method, t.installments)} · {formatCurrency(t.amount_cents / 100)}
                    </p>
                    <p className="text-muted">
                      {new Date(t.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      {(t.transaction_nsu || t.nsu) && ` · NSU ${t.transaction_nsu || t.nsu}`}
                      {t.authorization_code && ` · Aut ${t.authorization_code}`}
                      {t.card_brand && ` · ${t.card_brand}`}
                    </p>
                    {(t.warning || t.last_error) && <p className="text-red-400">{t.warning || t.last_error}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={t.status === "paid" ? "success" : t.status === "failed" || t.status === "amount_mismatch" ? "danger" : t.status === "cancelled" ? "neutral" : "warning"}>
                      {TX_STATUS_LABEL[t.status]}
                    </Badge>
                    {t.receipt_url && (
                      <a href={t.receipt_url} target="_blank" rel="noopener noreferrer" className="text-brand-soft hover:underline" aria-label="Ver comprovante InfinitePay">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                    {t.flow === "checkout" && t.status === "link_created" && (
                      <button type="button" className="text-muted hover:text-white" aria-label="Verificar pagamento" onClick={() => check(t.id)}>
                        <RefreshCw className="size-3.5" />
                      </button>
                    )}
                    {["started", "link_created", "awaiting_confirmation", "failed"].includes(t.status) && (
                      <button type="button" className="text-muted hover:text-red-400" aria-label="Cancelar tentativa" onClick={() => cancel(t.id)}>
                        <XCircle className="size-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
