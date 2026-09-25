"use client";

import { Plus } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { DataTable, type Column } from "@/components/admin/data-table";
import { DetailList, PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { PUBLIC_FLEET } from "@/data/fleet";
import { useAdminData } from "@/hooks/use-admin-data";
import { numOrUndef, numToStr, strOrUndef, useCrud } from "@/hooks/use-crud";
import { MONTHS, PAYMENT_STATE, VEHICLE_STATUS, VEHICLE_TYPES, statusOptions, toOptions } from "@/lib/constants";
import { formatCurrency, formatDate, isValidPlate, maskPlate, newId } from "@/lib/utils";
import type { FleetVehicle, PaymentState, VehicleStatus } from "@/types";

type Draft = {
  modelId: string;
  name: string;
  plate: string;
  vehicleType: string;
  status: VehicleStatus;
  purchaseDate: string;
  purchaseValue: string;
  year: string;
  yearModel: string;
  renavam: string;
  ipvaValue: string;
  ipvaStatus: PaymentState;
  licensingMonth: string;
  licensingStatus: PaymentState;
  weeklyRate: string;
  dailyRate: string;
  transmission: string;
  fuel: string;
  seats: string;
  airConditioning: boolean;
  notes: string;
};

const empty = (): Draft => ({
  modelId: PUBLIC_FLEET[0].id,
  name: PUBLIC_FLEET[0].name,
  plate: "",
  vehicleType: "Carro",
  status: "available",
  purchaseDate: "",
  purchaseValue: "",
  year: String(new Date().getFullYear()),
  yearModel: "",
  renavam: "",
  ipvaValue: "",
  ipvaStatus: "open",
  licensingMonth: "",
  licensingStatus: "open",
  weeklyRate: "",
  dailyRate: "",
  transmission: PUBLIC_FLEET[0].transmission,
  fuel: PUBLIC_FLEET[0].fuel,
  seats: String(PUBLIC_FLEET[0].seats),
  airConditioning: true,
  notes: "",
});

const toDraft = (v: FleetVehicle): Draft => ({
  modelId: PUBLIC_FLEET.find((m) => m.model === v.model)?.id ?? "",
  name: v.name,
  plate: v.plate,
  vehicleType: v.vehicleType,
  status: v.status,
  purchaseDate: v.purchaseDate ?? "",
  purchaseValue: numToStr(v.purchaseValue),
  year: String(v.year),
  yearModel: v.yearModel ?? "",
  renavam: v.renavam ?? "",
  ipvaValue: numToStr(v.ipvaValue),
  ipvaStatus: v.ipvaStatus,
  licensingMonth: v.licensingMonth ?? "",
  licensingStatus: v.licensingStatus,
  weeklyRate: numToStr(v.weeklyRate),
  dailyRate: numToStr(v.dailyRate),
  transmission: v.transmission,
  fuel: v.fuel,
  seats: String(v.seats),
  airConditioning: v.airConditioning,
  notes: v.notes ?? "",
});

const MODEL_OPTIONS = [...PUBLIC_FLEET.map((m) => ({ value: m.id, label: m.name })), { value: "", label: "Outro modelo" }];

export default function VehiclesPage() {
  const { data } = useAdminData();
  const crud = useCrud("vehicles", { empty, toDraft, noun: "Veículo" });
  const { draft, bind, set } = crud;
  const vehicles = data!.vehicles;

  const pickModel = (id: string) => {
    const model = PUBLIC_FLEET.find((m) => m.id === id);
    set("modelId", id);
    if (model) {
      set("name", model.name);
      set("transmission", model.transmission);
      set("fuel", model.fuel);
      set("seats", String(model.seats));
      set("airConditioning", model.airConditioning);
    }
  };

  const submit = () => {
    if (!isValidPlate(draft.plate)) return void toast.error("Placa inválida. Use ABC1234 ou ABC1D23.");
    const duplicate = vehicles.find((v) => v.plate === draft.plate && v.id !== crud.editing?.id);
    if (duplicate) return void toast.error(`A placa ${draft.plate} já está cadastrada.`);
    const model = PUBLIC_FLEET.find((m) => m.id === draft.modelId);
    const [brand, ...rest] = draft.name.trim().split(" ");
    crud.save({
      id: crud.editing?.id ?? newId(),
      name: draft.name.trim(),
      brand: model?.brand ?? brand,
      model: model?.model ?? (rest.join(" ") || brand),
      image: model?.image ?? crud.editing?.image ?? "/logos/locakar-circular.png",
      category: model?.category ?? crud.editing?.category ?? draft.vehicleType,
      year: Number(draft.year),
      plate: draft.plate,
      vehicleType: draft.vehicleType,
      status: draft.status,
      purchaseDate: strOrUndef(draft.purchaseDate),
      purchaseValue: numOrUndef(draft.purchaseValue),
      yearModel: strOrUndef(draft.yearModel),
      renavam: strOrUndef(draft.renavam),
      ipvaValue: numOrUndef(draft.ipvaValue),
      ipvaStatus: draft.ipvaStatus,
      licensingMonth: strOrUndef(draft.licensingMonth),
      licensingStatus: draft.licensingStatus,
      weeklyRate: numOrUndef(draft.weeklyRate),
      dailyRate: numOrUndef(draft.dailyRate),
      transmission: draft.transmission,
      fuel: draft.fuel,
      seats: Number(draft.seats) || 5,
      airConditioning: draft.airConditioning,
      notes: strOrUndef(draft.notes),
    });
  };

  const columns: Column<FleetVehicle>[] = [
    {
      key: "vehicle",
      header: "Veículo",
      sortValue: (v) => v.name,
      cell: (v) => (
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-white">
            <Image src={v.image} alt="" fill sizes="56px" className="object-contain p-0.5" />
          </div>
          <div>
            <p className="font-medium">{v.name}</p>
            <p className="text-xs text-muted">{v.yearModel ?? v.year} · {v.vehicleType}</p>
          </div>
        </div>
      ),
    },
    { key: "plate", header: "Placa", sortValue: (v) => v.plate, cell: (v) => <span className="font-mono text-xs tracking-wider">{v.plate}</span> },
    { key: "status", header: "Status", sortValue: (v) => v.status, cell: (v) => <StatusBadge map={VEHICLE_STATUS} value={v.status} /> },
    { key: "ipva", header: "IPVA", cell: (v) => <StatusBadge map={PAYMENT_STATE} value={v.ipvaStatus} /> },
    {
      key: "lic",
      header: "Licenciamento",
      cell: (v) => (
        <div className="flex items-center gap-2">
          <StatusBadge map={PAYMENT_STATE} value={v.licensingStatus} />
          <span className="text-xs text-muted">{v.licensingMonth}</span>
        </div>
      ),
    },
    { key: "weekly", header: "Semanal", sortValue: (v) => v.weeklyRate, cell: (v) => formatCurrency(v.weeklyRate), className: "text-right" },
  ];

  const v = crud.viewing;

  return (
    <>
      <PageHeader
        title="Veículos"
        description="Cadastro, status e documentação da frota."
        actions={
          <Button onClick={crud.openNew}>
            <Plus /> Novo veículo
          </Button>
        }
      />

      <DataTable
        label="Veículos"
        rows={vehicles}
        columns={columns}
        searchPlaceholder="Buscar por placa, modelo ou Renavam"
        searchText={(v) => `${v.plate} ${v.name} ${v.renavam ?? ""} ${v.notes ?? ""}`}
        initialSort={{ key: "plate", dir: "asc" }}
        filters={[
          { key: "status", label: "Status", options: statusOptions(VEHICLE_STATUS), predicate: (v, val) => v.status === val },
          { key: "type", label: "Tipo", options: toOptions(VEHICLE_TYPES), predicate: (v, val) => v.vehicleType === val },
          {
            key: "docs",
            label: "Documentação",
            options: [
              { value: "ok", label: "Em dia" },
              { value: "pending", label: "Pendente" },
            ],
            predicate: (v, val) => (v.ipvaStatus === "paid" && v.licensingStatus === "paid") === (val === "ok"),
          },
        ]}
        onView={crud.setViewing}
        onEdit={crud.openEdit}
        onDelete={crud.setDeleting}
      />

      <FormDialog
        open={crud.formOpen}
        onOpenChange={crud.setFormOpen}
        title={crud.editing ? "Editar veículo" : "Novo veículo"}
        onSubmit={submit}
        size="lg"
      >
        <Field label="Modelo" htmlFor="f-modelId">
          <Select id="f-modelId" value={draft.modelId} onChange={(e) => pickModel(e.target.value)} options={MODEL_OPTIONS} />
        </Field>
        <Field label="Descrição do veículo" htmlFor="f-name" required>
          <Input {...bind("name")} required />
        </Field>
        <Field label="Placa" htmlFor="f-plate" required hint="ABC1234 ou Mercosul ABC1D23">
          <Input {...bind("plate", maskPlate)} required placeholder="ABC1D23" className="font-mono uppercase" />
        </Field>
        <Field label="Tipo de veículo" htmlFor="f-vehicleType">
          <Select {...bind("vehicleType")} options={toOptions(VEHICLE_TYPES)} />
        </Field>
        <Field label="Status" htmlFor="f-status">
          <Select {...bind("status")} options={statusOptions(VEHICLE_STATUS)} />
        </Field>
        <Field label="Ano/modelo" htmlFor="f-yearModel">
          <Input {...bind("yearModel")} placeholder="2024/2024" />
        </Field>
        <Field label="Ano" htmlFor="f-year" required>
          <Input {...bind("year")} type="number" min={1990} max={2100} required />
        </Field>
        <Field label="Renavam" htmlFor="f-renavam">
          <Input {...bind("renavam", (x) => x.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" />
        </Field>
        <Field label="Data da compra" htmlFor="f-purchaseDate">
          <Input {...bind("purchaseDate")} type="date" />
        </Field>
        <Field label="Valor de compra (R$)" htmlFor="f-purchaseValue">
          <Input {...bind("purchaseValue")} type="number" min={0} step="0.01" />
        </Field>
        <Field label="IPVA (R$)" htmlFor="f-ipvaValue">
          <Input {...bind("ipvaValue")} type="number" min={0} step="0.01" />
        </Field>
        <Field label="Status IPVA" htmlFor="f-ipvaStatus">
          <Select {...bind("ipvaStatus")} options={statusOptions(PAYMENT_STATE)} />
        </Field>
        <Field label="Vencimento licenciamento" htmlFor="f-licensingMonth">
          <Select {...bind("licensingMonth")} options={toOptions(MONTHS)} placeholder="Selecione o mês" />
        </Field>
        <Field label="Status licenciamento" htmlFor="f-licensingStatus">
          <Select {...bind("licensingStatus")} options={statusOptions(PAYMENT_STATE)} />
        </Field>
        <Field label="Valor semanal (R$)" htmlFor="f-weeklyRate">
          <Input {...bind("weeklyRate")} type="number" min={0} step="0.01" />
        </Field>
        <Field label="Diária (R$)" htmlFor="f-dailyRate">
          <Input {...bind("dailyRate")} type="number" min={0} step="0.01" />
        </Field>
        <Field label="Transmissão" htmlFor="f-transmission">
          <Input {...bind("transmission")} />
        </Field>
        <Field label="Combustível" htmlFor="f-fuel">
          <Input {...bind("fuel")} />
        </Field>
        <Field label="Lugares" htmlFor="f-seats">
          <Input {...bind("seats")} type="number" min={1} max={60} />
        </Field>
        <div className="flex items-end pb-2">
          <Checkbox label="Ar-condicionado" checked={draft.airConditioning} onChange={(e) => set("airConditioning", e.target.checked)} />
        </div>
        <Field label="Observações" htmlFor="f-notes" className="sm:col-span-2">
          <Textarea {...bind("notes")} />
        </Field>
      </FormDialog>

      <Dialog
        open={!!v}
        onOpenChange={(o) => !o && crud.setViewing(null)}
        title={v ? `${v.name} · ${v.plate}` : ""}
        size="lg"
        footer={v && <Button onClick={() => crud.openEdit(v)}>Editar</Button>}
      >
        {v && (
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-white">
              <Image src={v.image} alt={v.name} fill sizes="220px" className="object-contain p-2" />
            </div>
            <DetailList
              items={[
                { label: "Status", value: <StatusBadge map={VEHICLE_STATUS} value={v.status} /> },
                { label: "Tipo", value: v.vehicleType },
                { label: "Ano/modelo", value: v.yearModel ?? v.year },
                { label: "Renavam", value: v.renavam },
                { label: "Data da compra", value: formatDate(v.purchaseDate) },
                { label: "Valor de compra", value: formatCurrency(v.purchaseValue) },
                { label: "IPVA", value: <>{formatCurrency(v.ipvaValue)} · <StatusBadge map={PAYMENT_STATE} value={v.ipvaStatus} /></> },
                { label: "Licenciamento", value: <>{v.licensingMonth ?? "—"} · <StatusBadge map={PAYMENT_STATE} value={v.licensingStatus} /></> },
                { label: "Valor semanal", value: formatCurrency(v.weeklyRate) },
                { label: "Especificações", value: `${v.transmission} · ${v.fuel} · ${v.seats} lugares${v.airConditioning ? " · Ar" : ""}` },
                { label: "Observações", value: v.notes, wide: true },
              ]}
            />
          </div>
        )}
      </Dialog>

      <DeleteDialog
        open={!!crud.deleting}
        onCancel={() => crud.setDeleting(null)}
        onConfirm={crud.confirmDelete}
        what={`o veículo ${crud.deleting?.plate ?? ""}`}
      />
    </>
  );
}
