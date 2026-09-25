"use client";

import { CircleDollarSign, Clock, KeyRound, Plus, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { DeleteDialog } from "@/components/admin/crud-dialogs";
import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { RentalForm, emptyRentalDraft, rentalToDraft } from "@/components/admin/rental-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { useCrud } from "@/hooks/use-crud";
import { rentalPending, rentalReceived } from "@/lib/analytics";
import { CONTRACT_TYPES, RENTAL_STATUS, ROUTES, statusOptions, toOptions } from "@/lib/constants";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";
import type { Rental } from "@/types";

export default function RentalsPage() {
  const router = useRouter();
  const { data } = useAdminData();
  const { clientName, vehicleLabel, vehicleById } = useLookups();
  const crud = useCrud("rentals", { empty: emptyRentalDraft, toDraft: rentalToDraft, noun: "Locação" });
  const rentals = data!.rentals;
  const today = todayISO();

  const active = rentals.filter((r) => r.status === "active" || r.status === "late");
  const received = rentals.reduce((acc, r) => acc + rentalReceived(r), 0);
  const pending = rentals.reduce((acc, r) => acc + rentalPending(r, today), 0);

  const columns: Column<Rental>[] = [
    {
      key: "client",
      header: "Locatário",
      sortValue: (r) => clientName(r.clientId),
      cell: (r) => (
        <div>
          <p className="font-medium">{clientName(r.clientId)}</p>
          <p className="text-xs text-muted">{r.contractType}</p>
        </div>
      ),
    },
    { key: "vehicle", header: "Veículo", sortValue: (r) => vehicleById.get(r.vehicleId)?.plate, cell: (r) => vehicleLabel(r.vehicleId) },
    {
      key: "period",
      header: "Período",
      sortValue: (r) => r.startDate,
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDate(r.startDate)} <span className="text-zinc-500">→</span> {formatDate(r.endDate)}
        </span>
      ),
    },
    { key: "weekly", header: "Semanal", sortValue: (r) => r.weeklyRate, cell: (r) => formatCurrency(r.weeklyRate) },
    { key: "received", header: "Recebido", sortValue: (r) => rentalReceived(r), cell: (r) => formatCurrency(rentalReceived(r)) },
    {
      key: "pending",
      header: "Em atraso",
      sortValue: (r) => rentalPending(r, today),
      cell: (r) => {
        const value = rentalPending(r, today);
        return value ? <span className="font-medium text-red-300">{formatCurrency(value)}</span> : <span className="text-muted">—</span>;
      },
    },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge map={RENTAL_STATUS} value={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Locações"
        description="Contratos, recebimentos semanais e quilometragem."
        actions={
          <Button onClick={crud.openNew}>
            <Plus /> Nova locação
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Ativas" value={active.length} icon={KeyRound} accent />
        <StatCard label="Atrasadas" value={rentals.filter((r) => r.status === "late").length} icon={TriangleAlert} />
        <StatCard label="Total recebido" value={formatCurrency(received)} icon={CircleDollarSign} />
        <StatCard label="Recebimentos em atraso" value={formatCurrency(pending)} icon={Clock} />
      </div>

      <DataTable
        label="Locações"
        rows={rentals}
        columns={columns}
        searchPlaceholder="Buscar por locatário ou placa"
        searchText={(r) => `${clientName(r.clientId)} ${vehicleLabel(r.vehicleId)}`}
        initialSort={{ key: "period", dir: "desc" }}
        filters={[
          { key: "status", label: "Status", options: statusOptions(RENTAL_STATUS), predicate: (r, v) => r.status === v },
          { key: "type", label: "Contrato", options: toOptions(CONTRACT_TYPES), predicate: (r, v) => r.contractType === v },
        ]}
        onView={(r) => router.push(`${ROUTES.rentals}/${r.id}`)}
        onEdit={crud.openEdit}
        onDelete={crud.setDeleting}
      />

      <RentalForm crud={crud} />

      <DeleteDialog
        open={!!crud.deleting}
        onCancel={() => crud.setDeleting(null)}
        onConfirm={crud.confirmDelete}
        what="esta locação e seus recebimentos"
      />
    </>
  );
}
