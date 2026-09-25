"use client";

import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { DataTable, type Column } from "@/components/admin/data-table";
import { NotifyButton } from "@/components/admin/notify-button";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { strOrUndef, useCrud } from "@/hooks/use-crud";
import { RESERVATION_STATUS, TONE_COLOR, statusOptions } from "@/lib/constants";
import { findConflict } from "@/lib/reservations";
import { addDays, cn, formatDate, newId, toISODate, todayISO } from "@/lib/utils";
import type { Reservation, ReservationStatus } from "@/types";

type Draft = { clientId: string; vehicleId: string; startDate: string; endDate: string; status: ReservationStatus; notes: string };

const empty = (): Draft => ({
  clientId: "",
  vehicleId: "",
  startDate: todayISO(),
  endDate: addDays(todayISO(), 7),
  status: "pending",
  notes: "",
});
const toDraft = (r: Reservation): Draft => ({ ...r, notes: r.notes ?? "" });

const WEEK_HEADERS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function Calendar({ reservations, onSelect }: { reservations: Reservation[]; onSelect: (r: Reservation) => void }) {
  const { clientName, vehicleById } = useLookups();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const today = todayISO();

  const days = useMemo(() => {
    const offset = (cursor.getDay() + 6) % 7; // semana começa na segunda
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset);
    return Array.from({ length: 42 }, (_, i) => toISODate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  }, [cursor]);

  const month = cursor.getMonth();
  const active = reservations.filter((r) => r.status !== "cancelled");

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-4">
        <h2 className="font-display text-base font-semibold first-letter:uppercase">
          {cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => setCursor(new Date(cursor.getFullYear(), month - 1, 1))}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Hoje
          </Button>
          <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => setCursor(new Date(cursor.getFullYear(), month + 1, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7">
          {WEEK_HEADERS.map((d) => (
            <div key={d} className="border-b border-line px-2 py-2 text-center text-xs font-semibold uppercase text-zinc-500">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const items = active.filter((r) => r.startDate <= day && day <= r.endDate);
            const inMonth = Number(day.slice(5, 7)) - 1 === month;
            return (
              <div
                key={day}
                className={cn("min-h-28 border-b border-r border-line/60 p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-white/[0.01] opacity-40")}
              >
                <span
                  className={cn(
                    "mb-1 inline-grid size-6 place-items-center rounded-full text-xs tabular-nums",
                    day === today ? "bg-magenta font-bold text-white" : "text-zinc-400",
                  )}
                >
                  {Number(day.slice(8))}
                </span>
                <div className="space-y-1">
                  {items.slice(0, 3).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onSelect(r)}
                      title={`${clientName(r.clientId)} · ${vehicleById.get(r.vehicleId)?.plate ?? ""}`}
                      className="block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-white hover:brightness-125"
                      style={{ background: `${TONE_COLOR[RESERVATION_STATUS[r.status].tone]}33`, borderLeft: `2px solid ${TONE_COLOR[RESERVATION_STATUS[r.status].tone]}` }}
                    >
                      {vehicleById.get(r.vehicleId)?.plate ?? "—"} · {clientName(r.clientId).split(" ")[0]}
                    </button>
                  ))}
                  {items.length > 3 && <p className="px-1 text-[11px] text-muted">+{items.length - 3}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

export default function ReservationsPage() {
  const { data } = useAdminData();
  const { clientName, vehicleLabel, clientOptions, vehicleOptions, vehicleById } = useLookups();
  const crud = useCrud("reservations", { empty, toDraft, noun: "Reserva" });
  const { draft, bind } = crud;
  const [view, setView] = useState<"list" | "calendar">("list");
  const reservations = data!.reservations;

  const submit = () => {
    if (draft.endDate < draft.startDate) return void toast.error("A data final deve ser posterior à inicial.");
    const id = crud.editing?.id ?? newId();
    const candidate = { id, vehicleId: draft.vehicleId, startDate: draft.startDate, endDate: draft.endDate, status: draft.status };
    const conflict = findConflict(reservations, candidate);
    if (conflict)
      return void toast.error(
        `Conflito: ${vehicleById.get(draft.vehicleId)?.plate} já reservado para ${clientName(conflict.clientId)} (${formatDate(conflict.startDate)} a ${formatDate(conflict.endDate)}).`,
      );
    const rentalConflict = findConflict(data!.rentals, candidate);
    if (rentalConflict)
      return void toast.error(`Conflito: veículo locado de ${formatDate(rentalConflict.startDate)} a ${formatDate(rentalConflict.endDate)}.`);
    crud.save({ id, clientId: draft.clientId, vehicleId: draft.vehicleId, startDate: draft.startDate, endDate: draft.endDate, status: draft.status, notes: strOrUndef(draft.notes) });
  };

  const columns: Column<Reservation>[] = [
    { key: "client", header: "Locatário", sortValue: (r) => clientName(r.clientId), cell: (r) => <span className="font-medium">{clientName(r.clientId)}</span> },
    { key: "vehicle", header: "Placa", sortValue: (r) => vehicleById.get(r.vehicleId)?.plate, cell: (r) => vehicleLabel(r.vehicleId) },
    { key: "start", header: "Data inicial", sortValue: (r) => r.startDate, cell: (r) => formatDate(r.startDate) },
    { key: "end", header: "Data final", sortValue: (r) => r.endDate, cell: (r) => formatDate(r.endDate) },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge map={RESERVATION_STATUS} value={r.status} /> },
    {
      key: "notify",
      header: "Cliente",
      cell: (r) => (r.status === "completed" ? null : <NotifyButton request={{ kind: "reservation", reservationId: r.id }} />),
    },
  ];

  return (
    <>
      <PageHeader
        title="Reservas"
        description="Agenda de reservas com verificação de conflito por veículo."
        actions={
          <>
            <div className="inline-flex rounded-xl border border-line p-1" role="group" aria-label="Visualização">
              {(
                [
                  ["list", "Lista", List],
                  ["calendar", "Calendário", CalendarDays],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  onClick={() => setView(key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    view === key ? "bg-magenta/20 text-white" : "text-muted hover:text-white",
                  )}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            <Button onClick={crud.openNew}>
              <Plus /> Nova reserva
            </Button>
          </>
        }
      />

      {view === "list" ? (
        <DataTable
          label="Reservas"
          rows={reservations}
          columns={columns}
          searchPlaceholder="Buscar por locatário ou placa"
          searchText={(r) => `${clientName(r.clientId)} ${vehicleLabel(r.vehicleId)}`}
          initialSort={{ key: "start", dir: "asc" }}
          filters={[
            { key: "status", label: "Status", options: statusOptions(RESERVATION_STATUS), predicate: (r, v) => r.status === v },
            { key: "vehicle", label: "Veículo", options: vehicleOptions, predicate: (r, v) => r.vehicleId === v },
          ]}
          onEdit={crud.openEdit}
          onDelete={crud.setDeleting}
        />
      ) : (
        <Calendar reservations={reservations} onSelect={crud.openEdit} />
      )}

      <FormDialog open={crud.formOpen} onOpenChange={crud.setFormOpen} title={crud.editing ? "Editar reserva" : "Nova reserva"} onSubmit={submit}>
        <Field label="Nome do locatário" htmlFor="f-clientId" required>
          <Select {...bind("clientId")} options={clientOptions} placeholder="Selecione" required />
        </Field>
        <Field label="Placa" htmlFor="f-vehicleId" required>
          <Select {...bind("vehicleId")} options={vehicleOptions} placeholder="Selecione" required />
        </Field>
        <Field label="Data inicial" htmlFor="f-startDate" required>
          <Input {...bind("startDate")} type="date" required />
        </Field>
        <Field label="Data final" htmlFor="f-endDate" required>
          <Input {...bind("endDate")} type="date" min={draft.startDate} required />
        </Field>
        <Field label="Status" htmlFor="f-status">
          <Select {...bind("status")} options={statusOptions(RESERVATION_STATUS)} />
        </Field>
        <Field label="Observação" htmlFor="f-notes" className="sm:col-span-2">
          <Textarea {...bind("notes")} />
        </Field>
      </FormDialog>

      <DeleteDialog open={!!crud.deleting} onCancel={() => crud.setDeleting(null)} onConfirm={crud.confirmDelete} what="esta reserva" />
    </>
  );
}
