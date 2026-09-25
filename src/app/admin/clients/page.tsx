"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { DataTable, type Column } from "@/components/admin/data-table";
import { DetailList, PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useAdminData } from "@/hooks/use-admin-data";
import { strOrUndef, useCrud } from "@/hooks/use-crud";
import { rentalReceived } from "@/lib/analytics";
import { RENTAL_STATUS } from "@/lib/constants";
import { addDays, formatCurrency, formatDate, hideCPF, isValidCPF, maskCPF, maskPhone, newId, todayISO } from "@/lib/utils";
import type { Client } from "@/types";

type Draft = Record<"name" | "phone" | "email" | "cpf" | "address" | "firstLicenseDate" | "cnhExpiry" | "notes" | "registeredAt", string>;

const empty = (): Draft => ({
  name: "",
  phone: "",
  email: "",
  cpf: "",
  address: "",
  firstLicenseDate: "",
  cnhExpiry: "",
  notes: "",
  registeredAt: todayISO(),
});

const toDraft = (c: Client): Draft => ({
  name: c.name,
  phone: c.phone,
  email: c.email ?? "",
  cpf: c.cpf,
  address: c.address ?? "",
  firstLicenseDate: c.firstLicenseDate ?? "",
  cnhExpiry: c.cnhExpiry ?? "",
  notes: c.notes ?? "",
  registeredAt: c.registeredAt,
});

function CnhBadge({ expiry, windowDays }: { expiry?: string; windowDays: number }) {
  if (!expiry) return <span className="text-muted">—</span>;
  const today = todayISO();
  const tone = expiry < today ? "danger" : expiry <= addDays(today, windowDays) ? "warning" : "success";
  return <Badge tone={tone}>{formatDate(expiry)}</Badge>;
}

export default function ClientsPage() {
  const { data, settings } = useAdminData();
  const crud = useCrud("clients", { empty, toDraft, noun: "Cliente" });
  const { draft, bind } = crud;
  const [revealCpf, setRevealCpf] = useState(false);
  const clients = data!.clients;
  const today = todayISO();

  const submit = () => {
    if (!isValidCPF(draft.cpf)) return void toast.error("CPF inválido.");
    if (clients.some((c) => c.cpf === draft.cpf && c.id !== crud.editing?.id)) return void toast.error("CPF já cadastrado.");
    crud.save({
      id: crud.editing?.id ?? newId(),
      code: crud.editing?.code ?? Math.max(0, ...clients.map((c) => c.code)) + 1,
      registeredAt: draft.registeredAt || today,
      name: draft.name.trim(),
      phone: draft.phone,
      email: strOrUndef(draft.email.toLowerCase()),
      cpf: draft.cpf,
      address: strOrUndef(draft.address),
      firstLicenseDate: strOrUndef(draft.firstLicenseDate),
      cnhExpiry: strOrUndef(draft.cnhExpiry),
      notes: strOrUndef(draft.notes),
    });
  };

  const columns: Column<Client>[] = [
    { key: "code", header: "ID", sortValue: (c) => c.code, cell: (c) => <span className="tabular-nums text-muted">#{String(c.code).padStart(3, "0")}</span> },
    { key: "name", header: "Nome", sortValue: (c) => c.name, cell: (c) => <span className="font-medium">{c.name}</span> },
    { key: "phone", header: "Telefone", cell: (c) => c.phone },
    { key: "cpf", header: "CPF", cell: (c) => <span className="font-mono text-xs">{hideCPF(c.cpf)}</span> },
    { key: "cnh", header: "Venc. CNH", sortValue: (c) => c.cnhExpiry, cell: (c) => <CnhBadge expiry={c.cnhExpiry} windowDays={settings.alertWindowDays} /> },
    { key: "reg", header: "Cadastro", sortValue: (c) => c.registeredAt, cell: (c) => formatDate(c.registeredAt) },
  ];

  const v = crud.viewing;
  const history = v ? data!.rentals.filter((r) => r.clientId === v.id).sort((a, b) => b.startDate.localeCompare(a.startDate)) : [];

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Locatários cadastrados. CPF exibido de forma parcial."
        actions={
          <Button onClick={crud.openNew}>
            <Plus /> Novo cliente
          </Button>
        }
      />

      <DataTable
        label="Clientes"
        rows={clients}
        columns={columns}
        searchPlaceholder="Buscar por nome, telefone ou CPF"
        searchText={(c) => `${c.name} ${c.email ?? ""} ${c.phone} ${c.phone.replace(/\D/g, "")} ${c.cpf.replace(/\D/g, "")}`}
        initialSort={{ key: "name", dir: "asc" }}
        filters={[
          {
            key: "cnh",
            label: "Situação da CNH",
            options: [
              { value: "ok", label: "Válida" },
              { value: "soon", label: "A vencer" },
              { value: "expired", label: "Vencida" },
            ],
            predicate: (c, val) => {
              if (!c.cnhExpiry) return false;
              const soon = addDays(today, settings.alertWindowDays);
              if (val === "expired") return c.cnhExpiry < today;
              if (val === "soon") return c.cnhExpiry >= today && c.cnhExpiry <= soon;
              return c.cnhExpiry > soon;
            },
          },
        ]}
        onView={(c) => {
          setRevealCpf(false);
          crud.setViewing(c);
        }}
        onEdit={crud.openEdit}
        onDelete={crud.setDeleting}
      />

      <FormDialog open={crud.formOpen} onOpenChange={crud.setFormOpen} title={crud.editing ? "Editar cliente" : "Novo cliente"} onSubmit={submit}>
        <Field label="Nome" htmlFor="f-name" required className="sm:col-span-2">
          <Input {...bind("name")} required autoComplete="off" />
        </Field>
        <Field label="Telefone" htmlFor="f-phone" required>
          <Input {...bind("phone", maskPhone)} required inputMode="tel" placeholder="(19) 90000-0000" minLength={14} />
        </Field>
        <Field label="E-mail" htmlFor="f-email" hint="Usado para contratos, termos e comprovantes">
          <Input {...bind("email")} type="email" inputMode="email" autoComplete="off" placeholder="cliente@exemplo.com" />
        </Field>
        <Field label="CPF" htmlFor="f-cpf" required>
          <Input {...bind("cpf", maskCPF)} required inputMode="numeric" placeholder="000.000.000-00" autoComplete="off" />
        </Field>
        <Field label="Endereço" htmlFor="f-address" className="sm:col-span-2">
          <Input {...bind("address")} />
        </Field>
        <Field label="1ª habilitação" htmlFor="f-firstLicenseDate">
          <Input {...bind("firstLicenseDate")} type="date" max={today} />
        </Field>
        <Field label="Vencimento CNH" htmlFor="f-cnhExpiry">
          <Input {...bind("cnhExpiry")} type="date" />
        </Field>
        <Field label="Data de cadastro" htmlFor="f-registeredAt">
          <Input {...bind("registeredAt")} type="date" />
        </Field>
        <Field label="Observações" htmlFor="f-notes" className="sm:col-span-2">
          <Textarea {...bind("notes")} />
        </Field>
      </FormDialog>

      <Dialog
        open={!!v}
        onOpenChange={(o) => !o && crud.setViewing(null)}
        title={v?.name ?? ""}
        description={v ? `Cliente #${String(v.code).padStart(3, "0")}` : undefined}
        footer={v && <Button onClick={() => crud.openEdit(v)}>Editar</Button>}
      >
        {v && (
          <div className="space-y-6">
            <DetailList
              items={[
                { label: "Telefone", value: v.phone },
                { label: "E-mail", value: v.email },
                {
                  label: "CPF",
                  value: (
                    <span className="inline-flex items-center gap-2 font-mono">
                      {revealCpf ? v.cpf : hideCPF(v.cpf)}
                      <button type="button" className="font-sans text-xs font-semibold text-brand-soft hover:underline" onClick={() => setRevealCpf((x) => !x)}>
                        {revealCpf ? "Ocultar" : "Mostrar"}
                      </button>
                    </span>
                  ),
                },
                { label: "Endereço", value: v.address, wide: true },
                { label: "1ª habilitação", value: formatDate(v.firstLicenseDate) },
                { label: "Vencimento CNH", value: <CnhBadge expiry={v.cnhExpiry} windowDays={settings.alertWindowDays} /> },
                { label: "Data de cadastro", value: formatDate(v.registeredAt) },
                { label: "Observações", value: v.notes, wide: true },
              ]}
            />
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Histórico de locações</h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma locação registrada.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {history.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span>
                        {formatDate(r.startDate)} → {formatDate(r.endDate)}
                        <span className="ml-2 text-xs text-muted">{formatCurrency(rentalReceived(r))} recebido</span>
                      </span>
                      <Badge tone={RENTAL_STATUS[r.status].tone}>{RENTAL_STATUS[r.status].label}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <DeleteDialog
        open={!!crud.deleting}
        onCancel={() => crud.setDeleting(null)}
        onConfirm={crud.confirmDelete}
        what={`o cliente ${crud.deleting?.name ?? ""}`}
      />
    </>
  );
}
