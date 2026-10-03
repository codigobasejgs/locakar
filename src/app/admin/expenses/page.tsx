"use client";

import { Plus, Receipt, Repeat, Shapes, Clock } from "lucide-react";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { numToStr, strOrUndef, useCrud } from "@/hooks/use-crud";
import { EXPENSE_CATEGORY, PAYMENT_METHODS, toOptions } from "@/lib/constants";
import { formatCurrency, formatDate, lastMonths, monthKey, monthLabel, newId, todayISO } from "@/lib/utils";
import type { Expense, ExpenseCategory } from "@/types";

type Draft = {
  date: string;
  description: string;
  vehicleId: string;
  supplier: string;
  amount: string;
  paid: boolean;
  paymentMethod: string;
  category: ExpenseCategory;
  notes: string;
};

const empty = (): Draft => ({
  date: todayISO(),
  description: "",
  vehicleId: "",
  supplier: "",
  amount: "",
  paid: true,
  paymentMethod: "",
  category: "misc",
  notes: "",
});
const toDraft = (e: Expense): Draft => ({
  date: e.date,
  description: e.description,
  vehicleId: e.vehicleId ?? "",
  supplier: e.supplier ?? "",
  amount: numToStr(e.amount),
  paid: e.paid,
  paymentMethod: e.paymentMethod ?? "",
  category: e.category,
  notes: e.notes ?? "",
});

const CATEGORY_OPTIONS = (Object.keys(EXPENSE_CATEGORY) as ExpenseCategory[]).map((k) => ({ value: k, label: EXPENSE_CATEGORY[k] }));

export default function ExpensesPage() {
  const { data } = useAdminData();
  const { vehicleOptions, vehicleById } = useLookups();
  const crud = useCrud("expenses", { empty, toDraft, noun: "Despesa" });
  const { draft, bind, set } = crud;
  const expenses = data!.expenses;

  const total = (list: Expense[]) => list.reduce((acc, e) => acc + e.amount, 0);
  const recurring = total(expenses.filter((e) => e.category === "recurring"));
  const misc = total(expenses.filter((e) => e.category === "misc"));
  const unpaid = total(expenses.filter((e) => !e.paid));

  const submit = () =>
    crud.save({
      id: crud.editing?.id ?? newId(),
      date: draft.date,
      description: draft.description.trim(),
      vehicleId: strOrUndef(draft.vehicleId),
      supplier: strOrUndef(draft.supplier),
      amount: Number(draft.amount),
      paid: draft.paid,
      paymentMethod: strOrUndef(draft.paymentMethod),
      category: draft.category,
      notes: strOrUndef(draft.notes),
    });

  const columns: Column<Expense>[] = [
    { key: "date", header: "Data", sortValue: (e) => e.date, cell: (e) => formatDate(e.date) },
    {
      key: "desc",
      header: "Descrição",
      sortValue: (e) => e.description,
      cell: (e) => (
        <div>
          <p className="font-medium">{e.description}</p>
          <p className="text-xs text-muted">{e.supplier ?? "—"}</p>
        </div>
      ),
    },
    { key: "plate", header: "Placa", cell: (e) => (e.vehicleId ? <span className="font-mono text-xs">{vehicleById.get(e.vehicleId)?.plate ?? "—"}</span> : <span className="text-muted">Frota</span>) },
    { key: "cat", header: "Categoria", sortValue: (e) => e.category, cell: (e) => <Badge tone={e.category === "recurring" ? "brand" : "neutral"}>{EXPENSE_CATEGORY[e.category]}</Badge> },
    { key: "method", header: "Pagamento", cell: (e) => <span className="text-muted">{e.paymentMethod ?? "—"}</span> },
    { key: "paid", header: "PG", sortValue: (e) => Number(e.paid), cell: (e) => <Badge tone={e.paid ? "success" : "warning"}>{e.paid ? "Pago" : "Pendente"}</Badge> },
    { key: "amount", header: "Valor", sortValue: (e) => e.amount, cell: (e) => <span className="font-medium tabular-nums">{formatCurrency(e.amount)}</span>, className: "text-right" },
  ];

  return (
    <>
      <PageHeader
        title="Despesas"
        description="Despesas recorrentes e diversas da operação."
        actions={
          <Button onClick={crud.openNew}>
            <Plus /> Nova despesa
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total recorrente" value={formatCurrency(recurring)} icon={Repeat} />
        <StatCard label="Total diversas" value={formatCurrency(misc)} icon={Shapes} />
        <StatCard label="Total geral" value={formatCurrency(recurring + misc)} icon={Receipt} accent />
        <StatCard label="A pagar" value={formatCurrency(unpaid)} icon={Clock} />
      </div>

      <DataTable
        label="Despesas"
        rows={expenses}
        columns={columns}
        searchPlaceholder="Buscar por descrição, fornecedor ou placa"
        searchText={(e) => `${e.description} ${e.supplier ?? ""} ${e.vehicleId ? (vehicleById.get(e.vehicleId)?.plate ?? "") : ""} ${e.notes ?? ""}`}
        initialSort={{ key: "date", dir: "desc" }}
        filters={[
          { key: "cat", label: "Categoria", options: CATEGORY_OPTIONS, predicate: (e, v) => e.category === v },
          { key: "month", label: "Mês", options: lastMonths(12).reverse().map((m) => ({ value: m, label: monthLabel(m) })), predicate: (e, v) => monthKey(e.date) === v },
          {
            key: "paid",
            label: "Pagamento",
            options: [
              { value: "yes", label: "Pago" },
              { value: "no", label: "Pendente" },
            ],
            predicate: (e, v) => e.paid === (v === "yes"),
          },
        ]}
        onEdit={crud.openEdit}
        onDelete={crud.setDeleting}
      />

      <FormDialog open={crud.formOpen} onOpenChange={crud.setFormOpen} title={crud.editing ? "Editar despesa" : "Nova despesa"} onSubmit={submit}>
        <Field label="Descrição" htmlFor="f-description" required className="sm:col-span-2">
          <Input {...bind("description")} required />
        </Field>
        <Field label="Data" htmlFor="f-date" required>
          <Input {...bind("date")} type="date" required />
        </Field>
        <Field label="Valor (R$)" htmlFor="f-amount" required>
          <Input {...bind("amount")} type="number" min={0.01} step="0.01" required />
        </Field>
        <Field label="Categoria" htmlFor="f-category">
          <Select {...bind("category")} options={CATEGORY_OPTIONS} />
        </Field>
        <Field label="Placa" htmlFor="f-vehicleId" hint="Deixe em branco para despesa da frota toda">
          <Select {...bind("vehicleId")} options={vehicleOptions} placeholder="Frota (geral)" />
        </Field>
        <Field label="Fornecedor" htmlFor="f-supplier">
          <Input {...bind("supplier")} />
        </Field>
        <Field label="Meio de pagamento" htmlFor="f-paymentMethod">
          <Select {...bind("paymentMethod")} options={toOptions(PAYMENT_METHODS)} placeholder="Selecione" />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox label="Pago" checked={draft.paid} onChange={(e) => set("paid", e.target.checked)} />
        </div>
        <Field label="Observação" htmlFor="f-notes" className="sm:col-span-2">
          <Textarea {...bind("notes")} />
        </Field>
      </FormDialog>

      <DeleteDialog open={!!crud.deleting} onCancel={() => crud.setDeleting(null)} onConfirm={crud.confirmDelete} what={`a despesa "${crud.deleting?.description ?? ""}"`} />
    </>
  );
}
