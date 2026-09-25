"use client";

import { CalendarClock, CheckCircle2, CircleDollarSign, Plus, Wrench } from "lucide-react";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { numOrUndef, numToStr, strOrUndef, useCrud } from "@/hooks/use-crud";
import { MAINTENANCE_STATUS, statusOptions } from "@/lib/constants";
import { formatCurrency, formatDate, formatNumber, newId, todayISO } from "@/lib/utils";
import type { Maintenance, MaintenanceStatus } from "@/types";

type Draft = {
  date: string;
  vehicleId: string;
  description: string;
  currentKm: string;
  nextKm: string;
  supplier: string;
  amount: string;
  status: MaintenanceStatus;
  notes: string;
};

const empty = (): Draft => ({
  date: todayISO(),
  vehicleId: "",
  description: "",
  currentKm: "",
  nextKm: "",
  supplier: "",
  amount: "",
  status: "scheduled",
  notes: "",
});
const toDraft = (m: Maintenance): Draft => ({
  date: m.date,
  vehicleId: m.vehicleId,
  description: m.description,
  currentKm: numToStr(m.currentKm),
  nextKm: numToStr(m.nextKm),
  supplier: m.supplier ?? "",
  amount: numToStr(m.amount),
  status: m.status,
  notes: m.notes ?? "",
});

export default function MaintenancePage() {
  const { data } = useAdminData();
  const { vehicleOptions, vehicleById, vehicleLabel } = useLookups();
  const crud = useCrud("maintenance", { empty, toDraft, noun: "Manutenção" });
  const { draft, bind } = crud;
  const items = data!.maintenance;

  const submit = () =>
    crud.save({
      id: crud.editing?.id ?? newId(),
      date: draft.date,
      vehicleId: draft.vehicleId,
      description: draft.description.trim(),
      currentKm: numOrUndef(draft.currentKm),
      nextKm: numOrUndef(draft.nextKm),
      supplier: strOrUndef(draft.supplier),
      amount: numOrUndef(draft.amount),
      status: draft.status,
      notes: strOrUndef(draft.notes),
    });

  const columns: Column<Maintenance>[] = [
    { key: "date", header: "Data", sortValue: (m) => m.date, cell: (m) => formatDate(m.date) },
    { key: "plate", header: "Placa", sortValue: (m) => vehicleById.get(m.vehicleId)?.plate, cell: (m) => vehicleLabel(m.vehicleId) },
    {
      key: "desc",
      header: "Descrição",
      cell: (m) => (
        <div>
          <p className="font-medium">{m.description}</p>
          <p className="text-xs text-muted">{m.supplier ?? "—"}</p>
        </div>
      ),
    },
    { key: "km", header: "KM atual", sortValue: (m) => m.currentKm, cell: (m) => <span className="tabular-nums">{formatNumber(m.currentKm)}</span> },
    { key: "next", header: "Próxima KM", sortValue: (m) => m.nextKm, cell: (m) => <span className="tabular-nums text-muted">{formatNumber(m.nextKm)}</span> },
    { key: "status", header: "Status", sortValue: (m) => m.status, cell: (m) => <StatusBadge map={MAINTENANCE_STATUS} value={m.status} /> },
    { key: "amount", header: "Valor", sortValue: (m) => m.amount, cell: (m) => formatCurrency(m.amount), className: "text-right" },
  ];

  const cost = items.filter((m) => m.status === "done").reduce((acc, m) => acc + (m.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Manutenção"
        description="Histórico e agenda de manutenções da frota."
        actions={
          <Button onClick={crud.openNew}>
            <Plus /> Nova manutenção
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Pendentes" value={items.filter((m) => m.status === "pending").length} icon={Wrench} accent />
        <StatCard label="Próximas" value={items.filter((m) => m.status === "scheduled").length} icon={CalendarClock} hint="agendadas" />
        <StatCard label="Realizadas" value={items.filter((m) => m.status === "done").length} icon={CheckCircle2} />
        <StatCard label="Custo total" value={formatCurrency(cost)} icon={CircleDollarSign} hint="manutenções realizadas" />
      </div>

      <DataTable
        label="Manutenções"
        rows={items}
        columns={columns}
        searchPlaceholder="Buscar por placa, descrição ou fornecedor"
        searchText={(m) => `${vehicleLabel(m.vehicleId)} ${m.description} ${m.supplier ?? ""}`}
        initialSort={{ key: "date", dir: "desc" }}
        filters={[
          { key: "status", label: "Status", options: statusOptions(MAINTENANCE_STATUS), predicate: (m, v) => m.status === v },
          { key: "vehicle", label: "Veículo", options: vehicleOptions, predicate: (m, v) => m.vehicleId === v },
        ]}
        onEdit={crud.openEdit}
        onDelete={crud.setDeleting}
      />

      <FormDialog open={crud.formOpen} onOpenChange={crud.setFormOpen} title={crud.editing ? "Editar manutenção" : "Nova manutenção"} onSubmit={submit}>
        <Field label="Placa" htmlFor="f-vehicleId" required>
          <Select {...bind("vehicleId")} options={vehicleOptions} placeholder="Selecione" required />
        </Field>
        <Field label="Data" htmlFor="f-date" required>
          <Input {...bind("date")} type="date" required />
        </Field>
        <Field label="Descrição" htmlFor="f-description" required className="sm:col-span-2">
          <Input {...bind("description")} required />
        </Field>
        <Field label="KM atual" htmlFor="f-currentKm">
          <Input {...bind("currentKm")} type="number" min={0} />
        </Field>
        <Field label="Próxima KM" htmlFor="f-nextKm">
          <Input {...bind("nextKm")} type="number" min={0} />
        </Field>
        <Field label="Fornecedor" htmlFor="f-supplier">
          <Input {...bind("supplier")} />
        </Field>
        <Field label="Valor (R$)" htmlFor="f-amount">
          <Input {...bind("amount")} type="number" min={0} step="0.01" />
        </Field>
        <Field label="Status" htmlFor="f-status">
          <Select {...bind("status")} options={statusOptions(MAINTENANCE_STATUS)} />
        </Field>
        <Field label="Observação" htmlFor="f-notes" className="sm:col-span-2">
          <Textarea {...bind("notes")} />
        </Field>
      </FormDialog>

      <DeleteDialog open={!!crud.deleting} onCancel={() => crud.setDeleting(null)} onConfirm={crud.confirmDelete} what="esta manutenção" />
    </>
  );
}
