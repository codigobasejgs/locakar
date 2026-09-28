"use client";

import { Ban, ExternalLink, FileText, Link as LinkIcon, Trash2, X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { CompanyProfile, Rental } from "@/types";
import { paymentReceiptDocument } from "@/lib/documents";
import { openDocument } from "@/components/admin/contract-panel";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface UnifiedPaymentItem {
  id: string; // receipt.id
  rentalId: string;
  rental: Rental;
  clientId: string;
  clientName: string;
  clientCpf: string;
  clientPhone: string;
  vehicleName: string;
  vehiclePlate: string;
  dueDate: string;
  weekday: string;
  amount: number;
  paid: boolean;
  paidAt?: string;
  amountPaid?: number;
  paymentMethod?: string;
  description: string;
  notes?: string;
  proofUrl?: string;
  cancelled?: boolean;
  cancelledAt?: string;
  cancelReason?: string;
  status: "open" | "paid" | "overdue" | "cancelled" | "pending_review";
  lateCharges?: { fee: number; interest: number; total: number };
}

interface PaymentActionsSheetProps {
  payment: UnifiedPaymentItem | null;
  company: CompanyProfile;
  onClose: () => void;
  onSettle: (p: UnifiedPaymentItem) => void;
  onEdit: (p: UnifiedPaymentItem) => void;
  onCharge: (p: UnifiedPaymentItem) => void;
  onCancel: (p: UnifiedPaymentItem) => void;
  onDelete: (p: UnifiedPaymentItem) => void;
  onViewDetails: (p: UnifiedPaymentItem) => void;
}

export function PaymentActionsSheet({
  payment,
  company,
  onClose,
  onCancel,
  onDelete,
  onViewDetails,
}: PaymentActionsSheetProps) {
  if (!payment) return null;

  const handleReceipt = () => {
    const html = paymentReceiptDocument({
      company,
      receiptNumber: payment.id.slice(-8).toUpperCase(),
      clientName: payment.clientName,
      clientDoc: payment.clientCpf,
      vehicleName: payment.vehicleName,
      vehiclePlate: payment.vehiclePlate,
      rentalId: payment.rentalId,
      description: payment.description,
      amount: payment.amountPaid ?? payment.amount,
      paymentDate: payment.paidAt || payment.dueDate,
      paymentMethod: payment.paymentMethod || (payment.paid ? "PIX / Dinheiro" : "Aguardando"),
      notes: payment.notes,
    });
    openDocument(html);
  };

  return (
    <D.Root open={!!payment} onOpenChange={(open) => !open && onClose()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <D.Content className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[85dvh] flex-col rounded-t-3xl border-t border-line-strong bg-panel p-5 shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
          {/* Cabeçalho do Bottom Sheet */}
          <div className="relative mb-4 flex items-center justify-center border-b border-line pb-3">
            <D.Title className="font-display text-base font-semibold text-white">Ações</D.Title>
            <D.Close asChild>
              <button
                type="button"
                onClick={onClose}
                className="absolute right-0 rounded-lg p-1 text-muted hover:text-white"
                aria-label="Fechar"
              >
                <X className="size-5" />
              </button>
            </D.Close>
          </div>

          <div className="mb-3 rounded-xl border border-line bg-surface p-3 text-xs">
            <p className="font-semibold text-white">{payment.clientName}</p>
            <p className="text-muted">
              {payment.vehiclePlate} · Vencimento {formatDate(payment.dueDate)} · {formatCurrency(payment.amount)}
            </p>
          </div>

          {/* Lista de Ações do Menu "Mais" (conforme imagem #18) */}
          <div className="flex flex-col gap-1">
            {/* 1. Cancelar Pagamento */}
            <button
              type="button"
              disabled={payment.cancelled || payment.paid}
              onClick={() => {
                onClose();
                onCancel(payment);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <div className="grid size-9 place-items-center rounded-full bg-red-500/10 text-red-400">
                <Ban className="size-4" />
              </div>
              <div>
                <p className="text-white">Cancelar Pagamento</p>
                <p className="text-xs text-muted">
                  {payment.cancelled ? "Já cancelado" : payment.paid ? "Pagamento já realizado" : "Registra cancelamento lógico no histórico"}
                </p>
              </div>
            </button>

            {/* 2. Excluir Pagamento */}
            <button
              type="button"
              disabled={payment.paid}
              onClick={() => {
                onClose();
                onDelete(payment);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <div className="grid size-9 place-items-center rounded-full bg-red-500/15 text-red-400">
                <Trash2 className="size-4" />
              </div>
              <div>
                <p className="text-red-400">Excluir Pagamento</p>
                <p className="text-xs text-muted">Remove a parcela da locação com confirmação</p>
              </div>
            </button>

            {/* 3. Gerar Recibo */}
            <button
              type="button"
              onClick={() => {
                onClose();
                handleReceipt();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-white/5"
            >
              <div className="grid size-9 place-items-center rounded-full bg-white/5 text-zinc-300">
                <FileText className="size-4" />
              </div>
              <div>
                <p className="text-white">Gerar Recibo</p>
                <p className="text-xs text-muted">Emite recibo oficial LOCAKAR em PDF / impressão</p>
              </div>
            </button>

            {/* 4. Obter Link da Fatura (Asaas) */}
            <div className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm opacity-50">
              <div className="grid size-9 place-items-center rounded-full bg-white/5 text-zinc-400">
                <LinkIcon className="size-4" />
              </div>
              <div className="flex-1">
                <p className="text-zinc-300">Obter Link da Fatura (Asaas)</p>
                <p className="text-xs text-muted">Integração Asaas não configurada nesta locadora</p>
              </div>
            </div>

            {/* 5. Ver detalhes */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onViewDetails(payment);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-white/5"
            >
              <div className="grid size-9 place-items-center rounded-full bg-magenta/15 text-brand-soft">
                <ExternalLink className="size-4" />
              </div>
              <div>
                <p className="text-white">Ver detalhes</p>
                <p className="text-xs text-muted">Raio-X completo da locação e da parcela</p>
              </div>
            </button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
