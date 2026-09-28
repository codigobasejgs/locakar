"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import type { UnifiedPaymentItem } from "./payment-actions-sheet";

interface PaymentEditDialogProps {
  payment: UnifiedPaymentItem | null;
  onClose: () => void;
  onSuccess: (data: {
    amount: number;
    dueDate: string;
    description: string;
    paymentMethod?: string;
    notes?: string;
  }) => Promise<void>;
}

export function PaymentEditDialog({ payment, onClose, onSuccess }: PaymentEditDialogProps) {
  const [amount, setAmount] = useState(() => (payment ? String(payment.amount) : ""));
  const [dueDate, setDueDate] = useState(() => payment?.dueDate || "");
  const [description, setDescription] = useState(() => payment?.description || "Aluguel");
  const [paymentMethod, setPaymentMethod] = useState(() => payment?.paymentMethod || "");
  const [notes, setNotes] = useState(() => payment?.notes || "");
  const [busy, setBusy] = useState(false);

  if (!payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!num || num <= 0) return toast.error("Informe um valor válido.");
    if (!dueDate) return toast.error("Informe a data de vencimento.");

    setBusy(true);
    try {
      await onSuccess({
        amount: num,
        dueDate,
        description: description.trim() || "Aluguel",
        paymentMethod: paymentMethod.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Pagamento atualizado com sucesso!");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
    setBusy(false);
  };

  return (
    <Dialog
      open={!!payment}
      onOpenChange={(open) => !open && !busy && onClose()}
      title="Editar pagamento"
      description={`Ajuste os dados da parcela · Locatário: ${payment.clientName}`}
      size="md"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="outline" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-payment-form" disabled={busy}>
            <Pencil className="size-4" />
            {busy ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      }
    >
      <form id="edit-payment-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor da cobrança (R$)" htmlFor="edit-amount" required>
            <Input
              id="edit-amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          <Field label="Data de vencimento" htmlFor="edit-duedate" required>
            <Input
              id="edit-duedate"
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Descrição da cobrança" htmlFor="edit-desc">
          <Input
            id="edit-desc"
            placeholder="Ex.: Aluguel semanal, Parcela 2, etc."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <Field label="Forma de pagamento (opcional)" htmlFor="edit-method">
          <Input
            id="edit-method"
            placeholder="PIX, Cartão, Dinheiro..."
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          />
        </Field>

        <Field label="Observações internas" htmlFor="edit-notes">
          <Textarea
            id="edit-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
