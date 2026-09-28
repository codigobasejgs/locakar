"use client";

import { CheckCircle2, FileUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { getSupabase } from "@/lib/supabase/client";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";
import type { UnifiedPaymentItem } from "./payment-actions-sheet";

interface PaymentSettleDialogProps {
  payment: UnifiedPaymentItem | null;
  onClose: () => void;
  onSuccess: (data: {
    amountPaid: number;
    paidAt: string;
    paymentMethod: string;
    notes?: string;
    proofUrl?: string;
  }) => Promise<void>;
}

const PAYMENT_METHODS = [
  { value: "PIX", label: "PIX" },
  { value: "Dinheiro", label: "Dinheiro em espécie" },
  { value: "Transferência bancária", label: "Transferência bancária (TED/DOC)" },
  { value: "Cartão de Débito", label: "Cartão de Débito" },
  { value: "Cartão de Crédito", label: "Cartão de Crédito" },
  { value: "Boleto", label: "Boleto bancário" },
  { value: "Outro", label: "Outro" },
];

export function PaymentSettleDialog({ payment, onClose, onSuccess }: PaymentSettleDialogProps) {
  const [amountPaid, setAmountPaid] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [notes, setNotes] = useState("");
  const [proofUrl, setProofUrl] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Inicializa o valor previsto quando o pagamento abre
  const expectedAmount = payment?.lateCharges?.total ?? payment?.amount ?? 0;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !payment) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${payment.clientId}/${payment.rentalId}_${payment.id}_baixa_${Date.now()}.${ext}`;
      const { error } = await getSupabase().storage.from("comprovantes").upload(path, file, { upsert: true });
      if (error) throw error;
      setProofUrl(path);
      toast.success("Comprovante anexado!");
    } catch {
      toast.error("Não foi possível enviar o comprovante. Tente novamente.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payment) return;
    const num = Number(amountPaid);
    if (!num || num <= 0) return toast.error("Informe um valor válido pago.");
    if (!paidAt) return toast.error("Informe a data do pagamento.");

    setBusy(true);
    try {
      await onSuccess({
        amountPaid: num,
        paidAt,
        paymentMethod,
        notes: notes.trim() || undefined,
        proofUrl,
      });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  };

  if (!payment) return null;

  return (
    <Dialog
      open={!!payment}
      onOpenChange={(open) => !open && !busy && onClose()}
      title="Dar baixa no pagamento"
      description="Confirme o recebimento para atualizar o financeiro e o histórico da locação."
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="settle-form" disabled={busy || uploading}>
            <CheckCircle2 className="size-4" />
            {busy ? "Confirmando..." : "Confirmar recebimento"}
          </Button>
        </div>
      }
    >
      <form id="settle-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Resumo da Cobrança */}
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-3 text-xs sm:grid-cols-4">
          <div>
            <p className="text-muted">Locatário</p>
            <p className="font-semibold text-white truncate">{payment.clientName}</p>
          </div>
          <div>
            <p className="text-muted">Veículo</p>
            <p className="font-semibold text-white truncate">{payment.vehicleName} ({payment.vehiclePlate})</p>
          </div>
          <div>
            <p className="text-muted">Vencimento</p>
            <p className="font-semibold text-white">{formatDate(payment.dueDate)}</p>
          </div>
          <div>
            <p className="text-muted">Valor previsto</p>
            <p className="font-semibold text-emerald-300">{formatCurrency(expectedAmount)}</p>
          </div>
        </div>

        {/* Campos de Baixa */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor pago (R$)" htmlFor="settle-amount" required>
            <Input
              id="settle-amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              defaultValue={expectedAmount}
              value={amountPaid || expectedAmount}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
          </Field>

          <Field label="Data do pagamento" htmlFor="settle-date" required>
            <Input
              id="settle-date"
              type="date"
              required
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Forma de pagamento" htmlFor="settle-method" required>
          <Select
            id="settle-method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            options={PAYMENT_METHODS}
          />
        </Field>

        <Field label="Observações do recebimento" htmlFor="settle-notes">
          <Textarea
            id="settle-notes"
            rows={2}
            placeholder="Ex.: comprovante enviado pelo locatário, pago em dinheiro na loja, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {/* Upload de comprovante */}
        <div className="rounded-xl border border-line bg-surface p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-white">Anexar comprovante (opcional)</p>
              <p className="text-muted">JPG, PNG ou PDF da transação bancária</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white/5 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10">
              <FileUp className="size-3.5" />
              <span>{uploading ? "Enviando..." : "Selecionar arquivo"}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                disabled={uploading}
                onChange={handleFileUpload}
              />
            </label>
          </div>
          {proofUrl && (
            <p className="mt-2 text-emerald-400 font-medium">✓ Comprovante anexado ({proofUrl.split("/").pop()})</p>
          )}
        </div>
      </form>
    </Dialog>
  );
}
