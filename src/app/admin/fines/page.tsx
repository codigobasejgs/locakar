"use client";

import { BellRing, CircleDollarSign, Mail, Plus, TriangleAlert, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { DataTable, type Column } from "@/components/admin/data-table";
import { EmailHistory } from "@/components/admin/email-history";
import { DetailList, PageHeader } from "@/components/admin/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { numOrUndef, numToStr, strOrUndef, useCrud } from "@/hooks/use-crud";
import { sendEmailRequest } from "@/lib/api";
import { FINE_STATUS, statusOptions } from "@/lib/constants";
import { addDays, daysBetween, formatCurrency, formatDate, newId, todayISO } from "@/lib/utils";
import type { Fine, FineStatus } from "@/types";

type Draft = Record<
  | "clientId"
  | "realOffender"
  | "vehicleId"
  | "noticeNumber"
  | "infractionDate"
  | "driverIdDeadline"
  | "discountDeadline"
  | "description"
  | "dueDate"
  | "amount"
  | "paymentDate"
  | "amountPaid"
  | "notes",
  string
> & { status: FineStatus };

const empty = (): Draft => ({
  clientId: "",
  realOffender: "",
  vehicleId: "",
  noticeNumber: "",
  infractionDate: todayISO(),
  driverIdDeadline: "",
  discountDeadline: "",
  description: "",
  dueDate: "",
  amount: "",
  paymentDate: "",
  amountPaid: "",
  status: "pending",
  notes: "",
});
const toDraft = (f: Fine): Draft => ({
  clientId: f.clientId ?? "",
  realOffender: f.realOffender ?? "",
  vehicleId: f.vehicleId,
  noticeNumber: f.noticeNumber,
  infractionDate: f.infractionDate,
  driverIdDeadline: f.driverIdDeadline ?? "",
  discountDeadline: f.discountDeadline ?? "",
  description: f.description,
  dueDate: f.dueDate,
  amount: numToStr(f.amount),
  paymentDate: f.paymentDate ?? "",
  amountPaid: numToStr(f.amountPaid),
  status: f.status,
  notes: f.notes ?? "",
});

function Deadline({ date, done }: { date?: string; done?: boolean }) {
  if (!date) return <span className="text-muted">—</span>;
  if (done) return <span className="text-muted">{formatDate(date)}</span>;
  const days = daysBetween(todayISO(), date);
  const tone = days < 0 ? "danger" : days <= 7 ? "warning" : "neutral";
  return (
    <Badge tone={tone}>
      {formatDate(date)}
      {days >= 0 && days <= 30 && <span className="opacity-70"> · {days}d</span>}
    </Badge>
  );
}

export default function FinesPage() {
  const { data } = useAdminData();
  const { clientName, clientOptions, vehicleOptions, vehicleById, vehicleLabel } = useLookups();
  const crud = useCrud("fines", { empty, toDraft, noun: "Multa" });
  const { draft, bind, set } = crud;
  const fines = data!.fines;
  const today = todayISO();

  // Status "Vencida" derivado automaticamente quando passa do vencimento sem pagamento.
  const effective = (f: Fine): FineStatus =>
    f.status !== "paid" && f.status !== "contested" && f.dueDate < today ? "overdue" : f.status;

  const open = fines.filter((f) => effective(f) !== "paid");
  const upcoming = open.filter((f) => f.dueDate >= today && f.dueDate <= addDays(today, 15));
  const idPending = fines.filter((f) => f.status === "identify");

  const notify = async (f: Fine) => {
    try {
      const to = await sendEmailRequest({ kind: "fine", fineId: f.id });
      toast.success(`Notificação enviada para ${to}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const submit = () =>
    crud.save({
      id: crud.editing?.id ?? newId(),
      clientId: strOrUndef(draft.clientId),
      realOffender: strOrUndef(draft.realOffender),
      vehicleId: draft.vehicleId,
      noticeNumber: draft.noticeNumber.trim().toUpperCase(),
      infractionDate: draft.infractionDate,
      driverIdDeadline: strOrUndef(draft.driverIdDeadline),
      discountDeadline: strOrUndef(draft.discountDeadline),
      description: draft.description.trim(),
      dueDate: draft.dueDate,
      amount: Number(draft.amount),
      paymentDate: strOrUndef(draft.paymentDate),
      amountPaid: numOrUndef(draft.amountPaid),
      status: draft.paymentDate && draft.amountPaid ? "paid" : draft.status,
      notes: strOrUndef(draft.notes),
    });

  const columns: Column<Fine>[] = [
    {
      key: "notice",
      header: "Auto de infração",
      sortValue: (f) => f.noticeNumber,
      cell: (f) => (
        <div>
          <p className="font-mono text-xs">{f.noticeNumber}</p>
          <p className="text-xs text-muted">{f.description}</p>
        </div>
      ),
    },
    {
      key: "client",
      header: "Locatário / placa",
      sortValue: (f) => clientName(f.clientId),
      cell: (f) => (
        <div>
          <p className="whitespace-nowrap">{clientName(f.clientId)}</p>
          <p className="font-mono text-xs text-muted">{vehicleById.get(f.vehicleId)?.plate ?? "—"}</p>
        </div>
      ),
    },
    { key: "idDeadline", header: "Ident. condutor", sortValue: (f) => f.driverIdDeadline, cell: (f) => <Deadline date={f.driverIdDeadline} done={f.status !== "identify"} /> },
    { key: "due", header: "Vencimento", sortValue: (f) => f.dueDate, cell: (f) => <Deadline date={f.dueDate} done={f.status === "paid"} /> },
    { key: "amount", header: "Valor", sortValue: (f) => f.amount, cell: (f) => formatCurrency(f.amount) },
    { key: "status", header: "Status", sortValue: (f) => effective(f), cell: (f) => <StatusBadge map={FINE_STATUS} value={effective(f)} /> },
  ];

  const v = crud.viewing;

  return (
    <>
      <PageHeader
        title="Multas"
        description="Autuações, prazos de identificação do condutor e pagamentos."
        actions={
          <Button onClick={crud.openNew}>
            <Plus /> Nova multa
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Em aberto" value={open.length} icon={TriangleAlert} accent />
        <StatCard label="Valor em aberto" value={formatCurrency(open.reduce((a, f) => a + f.amount, 0))} icon={CircleDollarSign} />
        <StatCard label="Identificar condutor" value={idPending.length} icon={UserSearch} />
        <StatCard label="Vencem em 15 dias" value={upcoming.length} icon={BellRing} />
      </div>

      {(upcoming.length > 0 || idPending.length > 0) && (
        <Card className="mb-6 border-amber-400/25 bg-amber-400/[0.04] p-4">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
            <BellRing className="size-4" /> Alertas de vencimento
          </p>
          <ul className="space-y-1 text-sm text-zinc-300">
            {idPending.map((f) => (
              <li key={`id-${f.id}`}>
                • Identificar condutor do auto <span className="font-mono">{f.noticeNumber}</span> ({vehicleById.get(f.vehicleId)?.plate}){" "}
                {f.driverIdDeadline && f.driverIdDeadline < today ? "— prazo encerrado em" : "até"} <strong>{formatDate(f.driverIdDeadline)}</strong>
              </li>
            ))}
            {upcoming.map((f) => (
              <li key={`due-${f.id}`}>
                • Vencimento de {formatCurrency(f.amount)} ({vehicleById.get(f.vehicleId)?.plate}) em <strong>{formatDate(f.dueDate)}</strong>
                {f.discountDeadline && f.discountDeadline >= today && <> — desconto até {formatDate(f.discountDeadline)}</>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <DataTable
        label="Multas"
        rows={fines}
        columns={columns}
        searchPlaceholder="Buscar por auto, placa, locatário ou infrator"
        searchText={(f) => `${f.noticeNumber} ${vehicleLabel(f.vehicleId)} ${clientName(f.clientId)} ${f.realOffender ?? ""} ${f.description}`}
        initialSort={{ key: "due", dir: "asc" }}
        filters={[{ key: "status", label: "Status", options: statusOptions(FINE_STATUS), predicate: (f, val) => effective(f) === val }]}
        onView={crud.setViewing}
        onEdit={crud.openEdit}
        onDelete={crud.setDeleting}
      />

      <FormDialog open={crud.formOpen} onOpenChange={crud.setFormOpen} title={crud.editing ? "Editar multa" : "Nova multa"} onSubmit={submit} size="lg">
        <Field label="Placa" htmlFor="f-vehicleId" required>
          <Select {...bind("vehicleId")} options={vehicleOptions} placeholder="Selecione" required />
        </Field>
        <Field label="Nº do auto de infração" htmlFor="f-noticeNumber" required>
          <Input {...bind("noticeNumber")} required className="font-mono uppercase" />
        </Field>
        <Field label="Locatário" htmlFor="f-clientId">
          <Select {...bind("clientId")} options={clientOptions} placeholder="Selecione" />
        </Field>
        <Field label="Real infrator" htmlFor="f-realOffender">
          <Input {...bind("realOffender")} />
        </Field>
        <Field label="Descrição da autuação" htmlFor="f-description" required className="sm:col-span-2">
          <Input {...bind("description")} required />
        </Field>
        <Field label="Data da autuação" htmlFor="f-infractionDate" required>
          <Input
            {...bind("infractionDate")}
            onChange={(e) => {
              set("infractionDate", e.target.value);
              if (e.target.value && !draft.driverIdDeadline) set("driverIdDeadline", addDays(e.target.value, 30));
            }}
            type="date"
            required
          />
        </Field>
        <Field label="Limite ident. condutor" htmlFor="f-driverIdDeadline">
          <Input {...bind("driverIdDeadline")} type="date" />
        </Field>
        <Field label="Limite pagto. com desconto" htmlFor="f-discountDeadline">
          <Input {...bind("discountDeadline")} type="date" />
        </Field>
        <Field label="Data de vencimento" htmlFor="f-dueDate" required>
          <Input {...bind("dueDate")} type="date" required />
        </Field>
        <Field label="Valor (R$)" htmlFor="f-amount" required>
          <Input {...bind("amount")} type="number" min={0} step="0.01" required />
        </Field>
        <Field label="Status" htmlFor="f-status" hint="Preencher pagamento marca como Pago">
          <Select {...bind("status")} options={statusOptions(FINE_STATUS)} />
        </Field>
        <Field label="Data de pagamento" htmlFor="f-paymentDate">
          <Input {...bind("paymentDate")} type="date" />
        </Field>
        <Field label="Valor pago (R$)" htmlFor="f-amountPaid">
          <Input {...bind("amountPaid")} type="number" min={0} step="0.01" />
        </Field>
        <Field label="Observação" htmlFor="f-notes" className="sm:col-span-2">
          <Textarea {...bind("notes")} />
        </Field>
      </FormDialog>

      <Dialog
        open={!!v}
        onOpenChange={(o) => !o && crud.setViewing(null)}
        title={v ? `Auto ${v.noticeNumber}` : ""}
        description={v?.description}
        footer={
          v && (
            <>
              <Button variant="outline" onClick={() => notify(v)} disabled={!v.clientId}>
                <Mail /> Notificar cliente por e-mail
              </Button>
              <Button onClick={() => crud.openEdit(v)}>Editar</Button>
            </>
          )
        }
      >
        {v && (
          <DetailList
            items={[
              { label: "Status", value: <StatusBadge map={FINE_STATUS} value={effective(v)} /> },
              { label: "Veículo", value: vehicleLabel(v.vehicleId) },
              { label: "Locatário", value: clientName(v.clientId) },
              { label: "Real infrator", value: v.realOffender },
              { label: "Data da autuação", value: formatDate(v.infractionDate) },
              { label: "Limite ident. condutor", value: formatDate(v.driverIdDeadline) },
              { label: "Limite com desconto", value: formatDate(v.discountDeadline) },
              { label: "Vencimento", value: formatDate(v.dueDate) },
              { label: "Valor", value: formatCurrency(v.amount) },
              { label: "Pagamento", value: v.paymentDate ? `${formatDate(v.paymentDate)} · ${formatCurrency(v.amountPaid)}` : "—" },
              { label: "Observação", value: v.notes, wide: true },
            ]}
          />
        )}
        {v && (
          <div className="mt-6">
            <EmailHistory title="Notificações enviadas" filter={(e) => e.fineId === v.id} />
          </div>
        )}
      </Dialog>

      <DeleteDialog open={!!crud.deleting} onCancel={() => crud.setDeleting(null)} onConfirm={crud.confirmDelete} what={`a multa ${crud.deleting?.noticeNumber ?? ""}`} />
    </>
  );
}
