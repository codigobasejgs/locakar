"use client";

import { CheckCircle2, MoreHorizontal, Pencil, User, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { statusLabel, statusTone } from "@/lib/asaas";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { UnifiedPaymentItem } from "./payment-actions-sheet";

interface PaymentCardProps {
  payment: UnifiedPaymentItem;
  onSettle: (p: UnifiedPaymentItem) => void;
  onEdit: (p: UnifiedPaymentItem) => void;
  onCharge: (p: UnifiedPaymentItem) => void;
  onMore: (p: UnifiedPaymentItem) => void;
}

export function PaymentCard({ payment, onSettle, onEdit, onCharge, onMore }: PaymentCardProps) {
  const isPaid = payment.status === "paid";
  const isOverdue = payment.status === "overdue";
  const isCancelled = payment.status === "cancelled";
  const displayAmount = isPaid ? (payment.amountPaid ?? payment.amount) : (payment.lateCharges?.total ?? payment.amount);

  return (
    <Card className="flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-panel p-4 shadow-sm transition-all duration-200 hover:border-line-strong sm:p-5">
      {/* Dados do Pagamento (conforme layout de referência) */}
      <div className="flex flex-col gap-3">
        {/* Linha 1: Locação & Vencimento */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Locação:</p>
            <div className="mt-0.5 flex items-center gap-1.5 truncate">
              <User className="size-3.5 shrink-0 text-muted" />
              <span className="truncate font-semibold text-white sm:text-base">{payment.clientName}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Car className="size-3.5 shrink-0 text-muted" />
              <span className="font-mono text-xs font-bold text-brand-soft">{payment.vehiclePlate}</span>
              <span className="truncate text-xs text-muted">· {payment.vehicleName}</span>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Vencimento:</p>
            <p className={`font-display text-sm font-bold sm:text-base ${isOverdue ? "text-red-400" : "text-white"}`}>
              {formatDate(payment.dueDate)}
            </p>
            <p className="text-xs text-muted capitalize">{payment.weekday}</p>
          </div>
        </div>

        {/* Linha 2: Pagamento & Valor */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Pagamento:</p>
            <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
              {payment.asaas && <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-sky-300">ASAAS</span>}
              {payment.paymentMethod || (isPaid ? "PIX" : "-")}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Valor:</p>
            <p className="font-display text-base font-extrabold text-white sm:text-lg tabular-nums">
              {formatCurrency(displayAmount)}
            </p>
            {isOverdue && payment.lateCharges && payment.lateCharges.total > payment.amount && (
              <p className="text-[10px] text-red-400 font-semibold">inclui multa e juros</p>
            )}
          </div>
        </div>

        {/* Linha 3: Descrição & Status */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Descrição:</p>
            <p className="text-xs font-medium text-zinc-300">{payment.description || "Aluguel"}</p>
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-0.5">Status:</p>
            <Badge
              tone={
                payment.asaas && !isPaid && !isCancelled && payment.asaas.status === "link_created"
                  ? statusTone({ status: payment.asaas.status, provider_status: payment.asaas.providerStatus })
                  : payment.asaas?.status === "chargeback"
                  ? "danger"
                  : isPaid
                  ? "success"
                  : isOverdue
                  ? "danger"
                  : isCancelled
                  ? "neutral"
                  : payment.status === "pending_review"
                  ? "brand"
                  : "warning"
              }
            >
              {payment.asaas && !isCancelled && payment.asaas.status !== "failed" && payment.asaas.status !== "cancelled"
                ? statusLabel({ status: payment.asaas.status, provider_status: payment.asaas.providerStatus })
                : isPaid
                ? "Pago"
                : isOverdue
                ? "Vencido"
                : isCancelled
                ? "Cancelado"
                : payment.status === "pending_review"
                ? "Em análise"
                : "Em aberto"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Linha Divisória */}
      <div className="my-3.5 h-px bg-line" />

      {/* Ações Circulares Inferiores (conforme imagem #17) */}
      <div className="grid grid-cols-4 gap-2 pt-0.5 text-center">
        {/* 1. Dar baixa */}
        <button
          type="button"
          disabled={isPaid || isCancelled}
          onClick={() => onSettle(payment)}
          className="group flex flex-col items-center gap-1.5 focus:outline-none disabled:opacity-40"
        >
          <div className={`grid size-11 place-items-center rounded-full border transition-all ${isPaid ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 group-hover:scale-105 group-hover:bg-emerald-500/25"}`}>
            <CheckCircle2 className="size-5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white">
            {isPaid ? "Baixado" : "Dar baixa"}
          </span>
        </button>

        {/* 2. Editar */}
        <button
          type="button"
          disabled={isPaid || isCancelled}
          onClick={() => onEdit(payment)}
          className="group flex flex-col items-center gap-1.5 focus:outline-none disabled:opacity-40"
        >
          <div className="grid size-11 place-items-center rounded-full border border-line-strong bg-white/5 text-zinc-300 transition-all group-hover:scale-105 group-hover:bg-white/10 group-hover:text-white">
            <Pencil className="size-4" />
          </div>
          <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white">Editar</span>
        </button>

        {/* 3. Cobrar (WhatsApp) */}
        <button
          type="button"
          disabled={isPaid || isCancelled}
          onClick={() => onCharge(payment)}
          className="group flex flex-col items-center gap-1.5 focus:outline-none disabled:opacity-40"
        >
          <div className="grid size-11 place-items-center rounded-full border border-emerald-500/40 bg-[#25D366]/15 text-[#25D366] transition-all group-hover:scale-105 group-hover:bg-[#25D366]/25">
            <WhatsAppIcon className="size-5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white">Cobrar</span>
        </button>

        {/* 4. Mais */}
        <button
          type="button"
          onClick={() => onMore(payment)}
          className="group flex flex-col items-center gap-1.5 focus:outline-none"
        >
          <div className="grid size-11 place-items-center rounded-full border border-line-strong bg-white/5 text-zinc-300 transition-all group-hover:scale-105 group-hover:bg-white/10 group-hover:text-white">
            <MoreHorizontal className="size-5" />
          </div>
          <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white">Mais</span>
        </button>
      </div>
    </Card>
  );
}
