"use client";

import { ExternalLink, FileText, KeyRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { getSupabase } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import type { UnifiedPaymentItem } from "./payment-actions-sheet";

interface PaymentDetailsDialogProps {
  payment: UnifiedPaymentItem | null;
  onClose: () => void;
}

export function PaymentDetailsDialog({ payment, onClose }: PaymentDetailsDialogProps) {
  const [signedProofUrl, setSignedProofUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (payment?.proofUrl) {
      getSupabase()
        .storage.from("comprovantes")
        .createSignedUrl(payment.proofUrl, 600)
        .then(({ data }) => {
          if (alive) setSignedProofUrl(data?.signedUrl ?? null);
        });
    }
    return () => {
      alive = false;
    };
  }, [payment?.proofUrl]);

  if (!payment) return null;

  return (
    <Dialog
      open={!!payment}
      onOpenChange={(open) => !open && onClose()}
      title="Detalhes do pagamento"
      description={`ID: #${payment.id.slice(-8).toUpperCase()}`}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between">
          <Button asChild size="sm" variant="outline">
            <Link href={`${ROUTES.rentals}/${payment.rentalId}`}>
              <KeyRound className="size-3.5" /> Abrir locação
            </Link>
          </Button>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 text-xs sm:text-sm">
        {/* Bloco 1: Locação e Cliente */}
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-soft">Locação & Cliente</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted">Locatário</p>
              <p className="font-semibold text-white">{payment.clientName}</p>
              <p className="text-muted">CPF: {payment.clientCpf}</p>
              <p className="text-muted">WhatsApp: {payment.clientPhone}</p>
            </div>
            <div>
              <p className="text-muted">Veículo</p>
              <p className="font-semibold text-white">{payment.vehicleName}</p>
              <p className="font-bold text-brand-soft">Placa: {payment.vehiclePlate}</p>
              <p className="text-muted">Locação #{payment.rentalId.slice(0, 8).toUpperCase()}</p>
            </div>
          </div>
        </div>

        {/* Bloco 2: Cobrança */}
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-soft">Dados da Cobrança</p>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-muted">Vencimento</p>
              <p className="font-semibold text-white">{formatDate(payment.dueDate)}</p>
              <p className="text-muted">{payment.weekday}</p>
            </div>
            <div>
              <p className="text-muted">Valor original</p>
              <p className="font-semibold text-white">{formatCurrency(payment.amount)}</p>
            </div>
            <div>
              <p className="text-muted">Descrição</p>
              <p className="font-semibold text-white">{payment.description}</p>
            </div>
            <div>
              <p className="text-muted">Situação</p>
              <Badge
                tone={
                  payment.status === "paid"
                    ? "success"
                    : payment.status === "overdue"
                    ? "danger"
                    : payment.status === "cancelled"
                    ? "neutral"
                    : "warning"
                }
              >
                {payment.status === "paid"
                  ? "Pago"
                  : payment.status === "overdue"
                  ? "Vencido"
                  : payment.status === "cancelled"
                  ? "Cancelado"
                  : "Em aberto"}
              </Badge>
            </div>
          </div>

          {payment.lateCharges && payment.lateCharges.total > payment.amount && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs">
              <p className="font-semibold text-amber-300">Atraso calculado:</p>
              <p className="text-muted">
                Multa: {formatCurrency(payment.lateCharges.fee)} · Juros: {formatCurrency(payment.lateCharges.interest)} · Total atual:{" "}
                <strong className="text-white">{formatCurrency(payment.lateCharges.total)}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Bloco 3: Pagamento e Quitação */}
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-soft">Quitação & Pagamento</p>
          {payment.paid ? (
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div>
                <p className="text-muted">Data do pagamento</p>
                <p className="font-semibold text-emerald-400">{formatDate(payment.paidAt || payment.dueDate)}</p>
              </div>
              <div>
                <p className="text-muted">Valor recebido</p>
                <p className="font-semibold text-emerald-400">{formatCurrency(payment.amountPaid ?? payment.amount)}</p>
              </div>
              <div>
                <p className="text-muted">Forma de pagamento</p>
                <p className="font-semibold text-white">{payment.paymentMethod || "PIX"}</p>
              </div>
              {payment.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-muted">Observação da baixa</p>
                  <p className="text-white">{payment.notes}</p>
                </div>
              )}
            </div>
          ) : payment.cancelled ? (
            <div className="text-xs text-muted">
              <p className="font-semibold text-zinc-300">Pagamento cancelado</p>
              {payment.cancelReason && <p>Motivo: {payment.cancelReason}</p>}
              {payment.cancelledAt && <p>Data: {formatDate(payment.cancelledAt)}</p>}
            </div>
          ) : (
            <p className="text-xs text-muted">Pagamento ainda não foi baixado.</p>
          )}

          {/* Comprovante */}
          {signedProofUrl && (
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-brand-soft" />
                <span className="text-xs text-zinc-300">Comprovante de pagamento</span>
              </div>
              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                <a href={signedProofUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3" /> Ver comprovante
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
