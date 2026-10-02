"use client";

import { ChevronRight, CreditCard, Landmark, QrCode, Settings2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PAYMENT_METHODS, type PaymentMethodId } from "@/lib/payment-methods";
import { formatCurrency } from "@/lib/utils";
import type { UnifiedPaymentItem } from "./payment-actions-sheet";

const ICON: Record<PaymentMethodId, typeof Landmark> = { asaas: Landmark, infinitepay: CreditCard, pix_manual: QrCode };
const HINT: Record<PaymentMethodId, string> = {
  asaas: "Pix, boleto, cartão ou fatura · baixa automática",
  infinitepay: "Aproximação ou link Pix/cartão · baixa automática",
  pix_manual: "QR Code da sua conta pelo WhatsApp · cliente envia comprovante",
};

/** "Cobrar": só os meios ativos em Configurações → Meios de pagamento. Nenhum ativo = atalho para configurar. */
export function ChargeMethodDialog({ payment, methods, onClose, onPick }: { payment: UnifiedPaymentItem | null; methods: PaymentMethodId[]; onClose: () => void; onPick: (m: PaymentMethodId) => void }) {
  if (!payment) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Cobrar cliente" description={`${payment.clientName} · ${payment.vehiclePlate} · ${formatCurrency(payment.lateCharges?.total ?? payment.amount)}`} size="sm">
      {methods.length ? (
        <div className="grid gap-2" role="list">
          {methods.map((m) => {
            const Icon = ICON[m];
            return (
              <button key={m} type="button" role="listitem" onClick={() => onPick(m)} className="flex items-center gap-3 rounded-xl border border-line px-3 py-3 text-left transition-colors hover:border-magenta/50 hover:bg-magenta/5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-magenta/15 text-brand-soft"><Icon className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{PAYMENT_METHODS[m].label}</span>
                  <span className="block text-xs text-muted">{HINT[m]}</span>
                </span>
                <ChevronRight className="size-4 text-muted" aria-hidden />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 text-sm">
          <p>Nenhum meio de pagamento está ativo.</p>
          <Button asChild variant="outline"><Link href="/admin/settings#config-meios"><Settings2 /> Configurar meios de pagamento</Link></Button>
        </div>
      )}
    </Dialog>
  );
}
