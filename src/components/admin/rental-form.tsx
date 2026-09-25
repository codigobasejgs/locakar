"use client";

import { toast } from "sonner";
import { FormDialog } from "@/components/admin/crud-dialogs";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { numOrUndef, numToStr, strOrUndef, type useCrud } from "@/hooks/use-crud";
import { buildWeeklyReceipts } from "@/lib/analytics";
import { CONTRACT_TYPES, RENTAL_STATUS, WEEKDAYS, statusOptions, toOptions } from "@/lib/constants";
import { findConflict } from "@/lib/reservations";
import { addDays, formatDate, newId, todayISO } from "@/lib/utils";
import type { Rental, RentalStatus } from "@/types";

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
  weeklyRate: numToStr(r.weeklyRate),
  status: r.status,
  notes: r.notes ?? "",
});

type RentalCrud = ReturnType<typeof useCrud<"rentals", RentalDraft>>;

/** Formulário de locação (compartilhado entre a lista e a página de detalhes). */
export function RentalForm({ crud }: { crud: RentalCrud }) {
  const { data, update } = useAdminData();
  const { clientOptions, vehicleOptions, vehicleById } = useLookups();
  const { draft, bind, set } = crud;

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

    const weeklyRate = Number(draft.weeklyRate) || 0;
    const periodChanged =
      !crud.editing ||
      crud.editing.startDate !== draft.startDate ||
      crud.editing.endDate !== draft.endDate ||
      crud.editing.weeklyRate !== weeklyRate;
    // Preserva recebimentos já pagos; regenera apenas a grade quando período/valor mudam.
    const receipts = periodChanged
      ? buildWeeklyReceipts({ id, startDate: draft.startDate, endDate: draft.endDate, weeklyRate }).map((r) => ({
          ...r,
          paid: crud.editing?.receipts.find((old) => old.dueDate === r.dueDate)?.paid ?? false,
        }))
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
      weeklyRate,
      receipts,
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
      <Field label="Valor semanal (R$)" htmlFor="f-weeklyRate" required>
        <Input {...bind("weeklyRate")} type="number" min={0} step="0.01" required />
      </Field>
      <Field label="Dia de pagamento semanal" htmlFor="f-paymentWeekday">
        <Select {...bind("paymentWeekday")} options={toOptions(WEEKDAYS)} placeholder="Selecione" />
      </Field>
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
