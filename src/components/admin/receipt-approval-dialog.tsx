"use client";

import { CheckCircle2, ExternalLink, Eye, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form";
import { useAdminData } from "@/hooks/use-admin-data";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PendingProof {
  id: string;
  rentalId: string;
  clientName: string;
  amount: number;
  installment: { number: number; dueDate: string; amount: number } | null;
  createdAt: string;
  imageUrl: string | null;
}

/** Comprovantes enviados pelo App do Locatário, aguardando conferência da equipe. */
export function ReceiptApprovalSection() {
  const { reload } = useAdminData();
  const [items, setItems] = useState<PendingProof[]>([]);
  const [open, setOpen] = useState<PendingProof | null>(null);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchPending = useCallback(async (): Promise<PendingProof[] | null> => {
    if (!isSupabaseEnabled) return null;
    const res = await fetch("/api/payments/receipt", { cache: "no-store" }).catch(() => null);
    const json = await res?.json().catch(() => ({}));
    return res?.ok ? (json.receipts ?? []) : null;
  }, []);
  const load = async () => {
    const list = await fetchPending();
    if (list) setItems(list);
  };

  useEffect(() => {
    let alive = true;
    fetchPending().then((list) => alive && list && setItems(list));
    return () => {
      alive = false;
    };
  }, [fetchPending]);

  const close = () => {
    setOpen(null);
    setRejecting(false);
    setReason("");
  };

  const act = async (action: "approve" | "reject") => {
    if (!open) return;
    setBusy(true);
    try {
      const res = await fetch("/api/payments/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, receiptId: open.id, rejectionReason: action === "reject" ? reason : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
      toast.success(action === "approve" ? "Pagamento aprovado. O cliente foi avisado." : "Comprovante rejeitado. O cliente foi avisado.");
      // A parcela aprovada aparece como paga no painel sem recarregar a página.
      if (action === "approve") await reload("rentals", open.rentalId);
      close();
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  if (!items.length) return null;

  return (
    <>
      <Card className="mb-6 border-amber-400/30">
        <CardHeader
          title={`Comprovantes para conferir (${items.length})`}
          description="Enviados pelos clientes no aplicativo. A parcela só fica paga depois da sua aprovação."
          action={<Badge tone="warning">Ação necessária</Badge>}
        />
        <ul className="divide-y divide-line px-5 pb-3">
          {items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium text-white">{r.clientName}</p>
                <p className="text-xs text-muted">
                  {r.installment ? `Parcela ${r.installment.number} · vence ${formatDate(r.installment.dueDate)} · ` : ""}
                  {formatCurrency(r.amount)} · enviado {new Date(r.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setOpen(r)}>
                <Eye /> Conferir
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog
        open={!!open}
        onOpenChange={(o) => !o && !busy && close()}
        title="Conferir comprovante"
        description="Confira valor, data e recebedor antes de aprovar."
        size="lg"
        footer={
          rejecting ? (
            <>
              <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
                Voltar
              </Button>
              <Button variant="danger" onClick={() => act("reject")} disabled={busy || !reason.trim()}>
                Confirmar rejeição
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                <XCircle /> Rejeitar
              </Button>
              <Button onClick={() => act("approve")} disabled={busy}>
                <CheckCircle2 /> {busy ? "Aprovando..." : "Aprovar pagamento"}
              </Button>
            </>
          )
        }
      >
        {open && (
          <div className="grid gap-4">
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line p-4 text-sm">
              <div>
                <dt className="text-xs uppercase text-muted">Cliente</dt>
                <dd className="font-medium">{open.clientName}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Valor esperado</dt>
                <dd className="font-medium text-emerald-300">{formatCurrency(open.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Parcela</dt>
                <dd>{open.installment ? `${open.installment.number} · vence ${formatDate(open.installment.dueDate)}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted">Locação</dt>
                <dd>{open.rentalId.slice(0, 8).toUpperCase()}</dd>
              </div>
            </dl>

            <div className="rounded-xl border border-line bg-white/[0.02] p-3 text-center">
              {open.imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={open.imageUrl} alt={`Comprovante enviado por ${open.clientName}`} className="mx-auto max-h-[420px] rounded-lg object-contain" />
                  <a href={open.imageUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">
                    <ExternalLink className="size-3" /> Abrir em tamanho original
                  </a>
                </>
              ) : (
                <p className="py-12 text-sm text-muted">Não foi possível carregar a imagem. Recarregue a página.</p>
              )}
            </div>

            {rejecting && (
              <div className="grid gap-2">
                <label htmlFor="reject-reason" className="text-sm font-medium">
                  Motivo (vai para o cliente)
                </label>
                <Textarea id="reject-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: valor diferente da parcela, comprovante ilegível, data errada." />
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
