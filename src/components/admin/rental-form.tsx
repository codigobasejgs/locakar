"use client";

import { toast } from "sonner";
import { FormDialog } from "@/components/admin/crud-dialogs";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { numOrUndef, numToStr, strOrUndef, type useCrud } from "@/hooks/use-crud";
import { INTEREST_LABEL, PERIOD_LABEL, buildReceipts } from "@/lib/billing";
import { CONTRACT_TYPES, RENTAL_STATUS, WEEKDAYS, statusOptions, toOptions } from "@/lib/constants";
import { findConflict } from "@/lib/reservations";
import { addDays, formatDate, newId, todayISO } from "@/lib/utils";
import type { BillingConfig, BillingPeriod, InterestPeriod, Rental, RentalStatus } from "@/types";

export type RentalDraft = {
  clientId: string;
  vehicleId: string;
  contractType: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  paymentWeekday: string;
  deposit: string;
  kmStart: string;
  kmEnd: string;
  weeklyRate: string;
  status: RentalStatus;
  notes: string;
  period: BillingPeriod;
  firstDue: string;
  until: string;
  lateFeePercent: string;
  interestPercent: string;
  interestPeriod: InterestPeriod;
  graceDays: string;
  autoSend: boolean;
  remindDaysBefore: string;
};

export const emptyRentalDraft = (): RentalDraft => ({
  clientId: "",
  vehicleId: "",
  contractType: CONTRACT_TYPES[0],
  startDate: todayISO(),
  startTime: "09:00",
  endDate: addDays(todayISO(), 28),
  endTime: "18:00",
  paymentWeekday: "",
  deposit: "",
  kmStart: "",
  kmEnd: "",
  weeklyRate: "",
  status: "active",
  notes: "",
  period: "weekly",
  firstDue: todayISO(),
  until: addDays(todayISO(), 28),
  lateFeePercent: "",
  interestPercent: "",
  interestPeriod: "daily",
  graceDays: "0",
  autoSend: true,
  remindDaysBefore: "1",
});

export const rentalToDraft = (r: Rental): RentalDraft => ({
  clientId: r.clientId,
  vehicleId: r.vehicleId,
  contractType: r.contractType,
  startDate: r.startDate,
  startTime: r.startTime ?? "",
  endDate: r.endDate,
  endTime: r.endTime ?? "",
  paymentWeekday: r.paymentWeekday ?? "",
  deposit: numToStr(r.deposit),
  kmStart: numToStr(r.kmStart),
  kmEnd: numToStr(r.kmEnd),
  weeklyRate: numToStr(r.billing?.amount ?? r.weeklyRate),
  status: r.status,
  notes: r.notes ?? "",
  period: r.billing?.period ?? "weekly",
  firstDue: r.billing?.firstDue ?? r.receipts[0]?.dueDate ?? r.startDate,
  until: r.billing?.until ?? r.endDate,
  lateFeePercent: numToStr(r.billing?.lateFeePercent),
  interestPercent: numToStr(r.billing?.interestPercent),
  interestPeriod: r.billing?.interestPeriod ?? "daily",
  graceDays: String(r.billing?.graceDays ?? 0),
  autoSend: r.billing?.autoSend ?? false,
  remindDaysBefore: String(r.billing?.remindDaysBefore ?? 1),
});

type RentalCrud = ReturnType<typeof useCrud<"rentals", RentalDraft>>;

/** Formulário de locação (compartilhado entre a lista e a página de detalhes). */
export function RentalForm({ crud }: { crud: RentalCrud }) {
  const { data, update } = useAdminData();
  const { clientOptions, vehicleOptions, vehicleById } = useLookups();
  const { draft, bind, set } = crud;
  const count = draft.firstDue && draft.until >= draft.firstDue ? buildReceipts({ id: "p", firstDue: draft.firstDue, until: draft.until, amount: 0, period: draft.period }).length : 0;
  const preview = count ? `${count} parcela(s) ${PERIOD_LABEL[draft.period].toLowerCase()}(s)` : undefined;

  const submit = async () => {
    if (draft.endDate < draft.startDate) return void toast.error("A data final deve ser posterior à inicial.");
    const kmStart = numOrUndef(draft.kmStart);
    const kmEnd = numOrUndef(draft.kmEnd);
    if (kmStart != null && kmEnd != null && kmEnd < kmStart) return void toast.error("KM final menor que o KM inicial.");

    const id = crud.editing?.id ?? newId();
    const candidate = { id, vehicleId: draft.vehicleId, startDate: draft.startDate, endDate: draft.endDate, status: draft.status };
    const conflict = findConflict(data!.rentals, candidate);
    if (conflict) {
      return void toast.error(`Veículo já locado de ${formatDate(conflict.startDate)} a ${formatDate(conflict.endDate)}.`);
    }

    if (draft.until < draft.firstDue) return void toast.error("A última cobrança deve ser igual ou posterior à primeira.");
    const amount = Number(draft.weeklyRate) || 0;
    const billing: BillingConfig = {
      period: draft.period,
      amount,
      firstDue: draft.firstDue,
      until: draft.until,
      lateFeePercent: Number(draft.lateFeePercent) || 0,
      interestPercent: Number(draft.interestPercent) || 0,
      interestPeriod: draft.interestPeriod,
      graceDays: Math.max(0, Number(draft.graceDays) || 0),
      autoSend: draft.autoSend,
      remindDaysBefore: Math.max(0, Number(draft.remindDaysBefore) || 0),
    };
    const old = crud.editing?.billing;
    const scheduleChanged =
      !crud.editing ||
      !old ||
      old.period !== billing.period ||
      old.firstDue !== billing.firstDue ||
      old.until !== billing.until ||
      old.amount !== billing.amount;
    // Preserva o que já foi pago; regenera a grade só quando periodicidade, datas ou valor mudam.
    const receipts = scheduleChanged
      ? buildReceipts({ id, firstDue: billing.firstDue, until: billing.until, amount, period: billing.period }).map((r) => {
          const prev = crud.editing?.receipts.find((o) => o.dueDate === r.dueDate);
          return prev?.paid ? { ...r, paid: true, paidAt: prev.paidAt, amountPaid: prev.amountPaid } : r;
        })
      : crud.editing!.receipts;

    const ok = await crud.save({
      id,
      clientId: draft.clientId,
      vehicleId: draft.vehicleId,
      contractType: draft.contractType,
      startDate: draft.startDate,
      startTime: strOrUndef(draft.startTime),
      endDate: draft.endDate,
      endTime: strOrUndef(draft.endTime),
      paymentWeekday: strOrUndef(draft.paymentWeekday),
      deposit: numOrUndef(draft.deposit),
      kmStart,
      kmEnd,
      // weeklyRate: mantido para relatórios antigos (valor da parcela).
      weeklyRate: amount,
      receipts,
      billing,
      status: draft.status,
      notes: strOrUndef(draft.notes),
    });

    // Mantém o status do veículo coerente com a locação.
    const vehicle = vehicleById.get(draft.vehicleId);
    if (ok && vehicle && vehicle.status !== "sold") {
      const next = draft.status === "active" || draft.status === "late" ? "rented" : draft.status === "finished" ? "available" : null;
      if (next && vehicle.status !== next) await update("vehicles", vehicle.id, { status: next });
    }
  };

  return (
    <FormDialog
      open={crud.formOpen}
      onOpenChange={crud.setFormOpen}
      title={crud.editing ? "Editar locação" : "Nova locação"}
      onSubmit={submit}
      size="lg"
      tour="rentals-form"
    >
      <Field label="Locatário" htmlFor="f-clientId" required>
        <Select {...bind("clientId")} options={clientOptions} placeholder="Selecione" required />
      </Field>
      <Field label="Veículo (placa)" htmlFor="f-vehicleId" required>
        <Select
          {...bind("vehicleId")}
          onChange={(e) => {
            set("vehicleId", e.target.value);
            const rate = vehicleById.get(e.target.value)?.weeklyRate;
            if (rate && !draft.weeklyRate) set("weeklyRate", String(rate));
          }}
          options={vehicleOptions}
          placeholder="Selecione"
          required
        />
      </Field>
      <Field label="Tipo de contrato" htmlFor="f-contractType">
        <Select {...bind("contractType")} options={toOptions(CONTRACT_TYPES)} />
      </Field>
      <Field label="Status" htmlFor="f-status">
        <Select {...bind("status")} options={statusOptions(RENTAL_STATUS)} />
      </Field>
      <Field label="Período inicial" htmlFor="f-startDate" required>
        <Input {...bind("startDate")} type="date" required />
      </Field>
      <Field label="Hora inicial" htmlFor="f-startTime">
        <Input {...bind("startTime")} type="time" />
      </Field>
      <Field label="Período final" htmlFor="f-endDate" required>
        <Input {...bind("endDate")} type="date" min={draft.startDate} required />
      </Field>
      <Field label="Hora final" htmlFor="f-endTime">
        <Input {...bind("endTime")} type="time" />
      </Field>
      <p data-tour="rentals-form-billing" className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted sm:col-span-2">Cobrança</p>
      <Field label="Periodicidade" htmlFor="f-period" required>
        <Select
          id="f-period"
          value={draft.period}
          onChange={(e) => set("period", e.target.value as BillingPeriod)}
          options={(Object.keys(PERIOD_LABEL) as BillingPeriod[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
        />
      </Field>
      <Field label={`Valor da parcela ${PERIOD_LABEL[draft.period].toLowerCase()} (R$)`} htmlFor="f-weeklyRate" required>
        <Input {...bind("weeklyRate")} type="number" min={0} step="0.01" required />
      </Field>
      <Field label="Primeira cobrança" htmlFor="f-firstDue" required>
        <Input {...bind("firstDue")} type="date" required />
      </Field>
      <Field label="Última cobrança até" htmlFor="f-until" required hint={preview}>
        <Input {...bind("until")} type="date" min={draft.firstDue} required />
      </Field>
      <Field label="Multa por atraso (%)" htmlFor="f-lateFeePercent" hint="Cobrada uma vez, após a carência">
        <Input {...bind("lateFeePercent")} type="number" min={0} max={100} step="0.01" placeholder="Ex.: 2" />
      </Field>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Juros por atraso (%)" htmlFor="f-interestPercent">
          <Input {...bind("interestPercent")} type="number" min={0} max={100} step="0.001" placeholder="Ex.: 0,033" />
        </Field>
        <Field label="Período" htmlFor="f-interestPeriod">
          <Select
            id="f-interestPeriod"
            value={draft.interestPeriod}
            onChange={(e) => set("interestPeriod", e.target.value as InterestPeriod)}
            options={(Object.keys(INTEREST_LABEL) as InterestPeriod[]).map((p) => ({ value: p, label: INTEREST_LABEL[p] }))}
          />
        </Field>
      </div>
      <Field label="Carência (dias)" htmlFor="f-graceDays" hint="Dias após o vencimento sem multa nem juros">
        <Input {...bind("graceDays")} type="number" min={0} max={60} />
      </Field>
      <Field label="Dia de pagamento" htmlFor="f-paymentWeekday" hint="Informativo, aparece no contrato">
        <Select {...bind("paymentWeekday")} options={toOptions(WEEKDAYS)} placeholder="Selecione" />
      </Field>
      <Checkbox
        label="Enviar a cobrança com PIX automaticamente (e-mail, WhatsApp e celular do cliente)"
        checked={draft.autoSend}
        onChange={(e) => set("autoSend", e.target.checked)}
        className="sm:col-span-2"
      />
      {draft.autoSend && (
        <Field label="Enviar quantos dias antes do vencimento" htmlFor="f-remindDaysBefore" hint="0 = só no dia. Atrasadas são lembradas a cada 3 dias.">
          <Input {...bind("remindDaysBefore")} type="number" min={0} max={30} />
        </Field>
      )}
      <Field label="Caução (R$)" htmlFor="f-deposit">
        <Input {...bind("deposit")} type="number" min={0} step="0.01" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="KM inicial" htmlFor="f-kmStart">
          <Input {...bind("kmStart")} type="number" min={0} />
        </Field>
        <Field label="KM final" htmlFor="f-kmEnd">
          <Input {...bind("kmEnd")} type="number" min={0} />
        </Field>
      </div>
      <Field label="Observação" htmlFor="f-notes" className="sm:col-span-2">
        <Textarea {...bind("notes")} />
      </Field>
    </FormDialog>
  );
}
