"use client";

import { Copy, ExternalLink, Link as LinkIcon, RefreshCw, Share2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { GATEWAYS, gatewayMethodLabel, type GatewayId } from "@/lib/gateways";
import { TX_STATUS_LABEL, type TransactionStatus } from "@/lib/infinitepay";
import { formatCurrency } from "@/lib/utils";
import type { UnifiedPaymentItem } from "./payment-actions-sheet";

interface Tx { id: string; provider: GatewayId; status: TransactionStatus; amount_cents: number; method: string | null; installments: number | null; checkout_url: string | null; last_error: string | null; created_at: string }

async function api<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/payments/gateways", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
  return json as T;
}

/** Cobrar uma parcela por link (Mercado Pago, PagBank ou Pagar.me). O valor é recalculado no servidor. */
export function GatewayChargeDialog({ provider, payment, onClose, onPaid }: { provider: GatewayId; payment: UnifiedPaymentItem; onClose: () => void; onPaid: () => void }) {
  const label = GATEWAYS[provider].label;
  const expected = payment.lateCharges?.total ?? payment.amount;
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [history, setHistory] = useState<Tx[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/payments/gateways?rentalId=${encodeURIComponent(payment.rentalId)}&receiptId=${encodeURIComponent(payment.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { transactions?: Tx[] }) => {
        if (!alive) return;
        const list = j.transactions ?? [];
        setHistory(list);
        const open = list.find((t) => t.provider === provider && t.status === "link_created" && t.checkout_url);
        if (open) setLink({ id: open.id, url: open.checkout_url! });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [payment, provider]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const create = () => run(async () => {
    const r = await api<{ id: string; url: string; reused?: boolean }>({ action: "create", provider, rentalId: payment.rentalId, receiptId: payment.id });
    setLink({ id: r.id, url: r.url });
    toast.success(r.reused ? "Link existente reaproveitado." : "Link criado.");
  });
  const check = (id: string) => run(async () => {
    const r = await api<{ status: string }>({ action: "check", id });
    if (r.status === "paid") {
      toast.success(`Pagamento confirmado pelo ${label}. Parcela baixada.`);
      onPaid();
      onClose();
    } else if (r.status === "amount_mismatch") toast.error("Valor pago diferente do cobrado. Confira no painel do gateway.");
    else toast.message("Pagamento ainda não confirmado.");
  });
  const whatsapp = () => link && run(async () => {
    await api({ action: "whatsapp", id: link.id });
    toast.success(`Link enviado no WhatsApp de ${payment.clientName}.`);
  });
  const cancel = (id: string) => run(async () => {
    await api({ action: "cancel", id });
    setHistory((h) => h.map((t) => (t.id === id ? { ...t, status: "cancelled" } : t)));
    if (link?.id === id) setLink(null);
  });
  const copy = () => link && navigator.clipboard.writeText(link.url).then(() => toast.success("Link copiado."), () => toast.error("Não foi possível copiar."));
  const share = async () => {
    if (!link) return;
    if (navigator.share) await navigator.share({ title: "Pagamento da locação", url: link.url }).catch(() => {});
    else await copy();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()} title={`Cobrar com ${label}`} description="Link de pagamento: Pix, cartão ou boleto. A parcela baixa sozinha quando o pagamento é confirmado." size="md">
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

        {link ? (
          <div className="grid gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-sm font-semibold text-emerald-300">Link pronto (vale 3 dias).</p>
            <p className="break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-xs text-zinc-300">{link.url}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="sm"><a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Abrir</a></Button>
              <Button variant="outline" size="sm" onClick={copy}><Copy /> Copiar</Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={whatsapp}><WhatsAppIcon className="size-4" /> Enviar WhatsApp</Button>
              <Button variant="outline" size="sm" onClick={share}><Share2 /> Compartilhar</Button>
            </div>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => check(link.id)}><RefreshCw /> Verificar pagamento</Button>
          </div>
        ) : (
          <Button disabled={busy} onClick={create}><LinkIcon /> {busy ? "Gerando link…" : "Gerar link de pagamento"}</Button>
        )}

        {history.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Cobranças por link nesta parcela</p>
            <ul className="grid gap-2">
              {history.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{gatewayMethodLabel(t.provider, t.method, t.installments)} · {formatCurrency(t.amount_cents / 100)}</p>
                    <p className="text-muted">{new Date(t.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                    {t.last_error && <p className="text-red-400">{t.last_error}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={t.status === "paid" ? "success" : t.status === "failed" || t.status === "amount_mismatch" ? "danger" : t.status === "cancelled" ? "neutral" : "warning"}>{TX_STATUS_LABEL[t.status] ?? t.status}</Badge>
                    {t.status === "link_created" && <button type="button" className="text-muted hover:text-white" aria-label="Verificar pagamento" onClick={() => check(t.id)}><RefreshCw className="size-3.5" /></button>}
                    {["started", "link_created", "failed"].includes(t.status) && <button type="button" className="text-muted hover:text-red-400" aria-label="Cancelar cobrança" onClick={() => cancel(t.id)}><XCircle className="size-3.5" /></button>}
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
