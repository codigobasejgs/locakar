"use client";

import { ExternalLink, FileText, FileUp, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { DataTable, type Column } from "@/components/admin/data-table";
import { DetailList, PageHeader } from "@/components/admin/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAdminData } from "@/hooks/use-admin-data";
import { strOrUndef, useCrud } from "@/hooks/use-crud";
import { rentalReceived } from "@/lib/analytics";
import { fetchAddressByCep } from "@/lib/cep";
import { RENTAL_STATUS } from "@/lib/constants";
import { getSupabase } from "@/lib/supabase/client";
import { orgPath } from "@/lib/org-path";
import {
  addDays,
  formatCurrency,
  formatDate,
  hideDoc,
  isValidDoc,
  maskCEP,
  maskDoc,
  maskPhone,
  newId,
  todayISO,
} from "@/lib/utils";
import type { Client, DocType } from "@/types";

type Draft = {
  name: string;
  docType: DocType;
  cpf: string;
  rg: string;
  cnhNumber: string;
  cnhCategory: string;
  cnhExpiry: string;
  kmDaily: string;
  kmMonthly: string;
  email: string;
  phone: string;
  backupPhone: string;
  cep: string;
  state: string;
  city: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  address: string;
  firstLicenseDate: string;
  cnhPdfUrl: string;
  notes: string;
  registeredAt: string;
};

const empty = (): Draft => ({
  name: "",
  docType: "cpf",
  cpf: "",
  rg: "",
  cnhNumber: "",
  cnhCategory: "B",
  cnhExpiry: "",
  kmDaily: "",
  kmMonthly: "",
  email: "",
  phone: "",
  backupPhone: "",
  cep: "",
  state: "",
  city: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  address: "",
  firstLicenseDate: "",
  cnhPdfUrl: "",
  notes: "",
  registeredAt: todayISO(),
});

const toDraft = (c: Client): Draft => ({
  name: c.name,
  docType: c.docType ?? (c.cpf.replace(/\D/g, "").length === 14 ? "cnpj" : "cpf"),
  cpf: c.cpf,
  rg: c.rg ?? "",
  cnhNumber: c.cnhNumber ?? "",
  cnhCategory: c.cnhCategory ?? "B",
  cnhExpiry: c.cnhExpiry ?? "",
  kmDaily: c.kmDaily ? String(c.kmDaily) : "",
  kmMonthly: c.kmMonthly ? String(c.kmMonthly) : "",
  email: c.email ?? "",
  phone: c.phone,
  backupPhone: c.backupPhone ?? "",
  cep: c.cep ?? "",
  state: c.state ?? "",
  city: c.city ?? "",
  street: c.street ?? "",
  number: c.number ?? "",
  complement: c.complement ?? "",
  neighborhood: c.neighborhood ?? "",
  address: c.address ?? "",
  firstLicenseDate: c.firstLicenseDate ?? "",
  cnhPdfUrl: c.cnhPdfUrl ?? "",
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
  const { draft, bind, set } = crud;
  const [revealDoc, setRevealDoc] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const clients = data!.clients;
  const today = todayISO();

  const handleCepChange = async (val: string) => {
    const masked = maskCEP(val);
    set("cep", masked);
    const clean = val.replace(/\D/g, "");
    if (clean.length === 8) {
      setLookingUpCep(true);
      try {
        const addr = await fetchAddressByCep(clean);
        if (addr) {
          if (addr.street) set("street", addr.street);
          if (addr.neighborhood) set("neighborhood", addr.neighborhood);
          if (addr.city) set("city", addr.city);
          if (addr.state) set("state", addr.state);
          toast.success("Endereço preenchido pelo CEP!");
        }
      } catch {
        /* silencioso */
      }
      setLookingUpCep(false);
    }
  };

  const handleCnhPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      const cleanDoc = draft.cpf.replace(/\D/g, "") || "doc";
      const ext = file.name.split(".").pop() || "pdf";
      const path = await orgPath(`clientes/${cleanDoc}/cnh_digital_${Date.now()}.${ext}`);
      const { error } = await getSupabase().storage.from("documentos").upload(path, file, { upsert: true });
      if (error) throw error;
      set("cnhPdfUrl", path);
      toast.success("CNH Digital anexada com sucesso!");
    } catch {
      toast.error("Não foi possível enviar a CNH. Tente novamente.");
    }
    setUploadingPdf(false);
    e.target.value = "";
  };

  const submit = () => {
    const docType = draft.docType as DocType;
    if (!isValidDoc(draft.cpf, docType)) {
      return void toast.error(docType === "cnpj" ? "CNPJ inválido." : "CPF inválido.");
    }
    const cleanDoc = draft.cpf.replace(/\D/g, "");
    if (clients.some((c) => c.cpf.replace(/\D/g, "") === cleanDoc && c.id !== crud.editing?.id)) {
      return void toast.error(`${docType.toUpperCase()} já cadastrado.`);
    }

    const fullAddress = [
      draft.street && `${draft.street}, ${draft.number || "s/n"}`,
      draft.complement,
      draft.neighborhood,
      draft.city && draft.state && `${draft.city} - ${draft.state}`,
      draft.cep && `CEP ${draft.cep}`,
    ]
      .filter(Boolean)
      .join(" · ");

    crud.save({
      id: crud.editing?.id ?? newId(),
      code: crud.editing?.code ?? Math.max(0, ...clients.map((c) => c.code)) + 1,
      registeredAt: draft.registeredAt || today,
      name: draft.name.trim(),
      docType,
      cpf: draft.cpf.trim(),
      rg: strOrUndef(draft.rg),
      cnhNumber: strOrUndef(draft.cnhNumber),
      cnhCategory: strOrUndef(draft.cnhCategory),
      cnhExpiry: strOrUndef(draft.cnhExpiry),
      kmDaily: draft.kmDaily ? Number(draft.kmDaily) : undefined,
      kmMonthly: draft.kmMonthly ? Number(draft.kmMonthly) : undefined,
      email: strOrUndef(draft.email.toLowerCase()),
      phone: draft.phone.trim(),
      backupPhone: strOrUndef(draft.backupPhone),
      cep: strOrUndef(draft.cep),
      state: strOrUndef(draft.state),
      city: strOrUndef(draft.city),
      street: strOrUndef(draft.street),
      number: strOrUndef(draft.number),
      complement: strOrUndef(draft.complement),
      neighborhood: strOrUndef(draft.neighborhood),
      address: fullAddress || strOrUndef(draft.address) || strOrUndef(draft.street),
      cnhPdfUrl: strOrUndef(draft.cnhPdfUrl),
      firstLicenseDate: strOrUndef(draft.firstLicenseDate),
      notes: strOrUndef(draft.notes),
    });
  };

  const columns: Column<Client>[] = [
    {
      key: "code",
      header: "ID",
      sortValue: (c) => c.code,
      cell: (c) => <span className="tabular-nums text-muted">#{String(c.code).padStart(3, "0")}</span>,
    },
    {
      key: "name",
      header: "Nome / Razão",
      sortValue: (c) => c.name,
      cell: (c) => (
        <div>
          <p className="font-medium text-white">{c.name}</p>
          {c.city && <p className="text-xs text-muted">{c.city} - {c.state}</p>}
        </div>
      ),
    },
    {
      key: "doc",
      header: "Documento",
      cell: (c) => (
        <span className="font-mono text-xs">
          {c.docType === "cnpj" ? "CNPJ " : "CPF "}
          {hideDoc(c.cpf, c.docType ?? "cpf")}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Telefone",
      cell: (c) => (
        <div>
          <p>{c.phone}</p>
          {c.backupPhone && <p className="text-xs text-muted">Recado: {c.backupPhone}</p>}
        </div>
      ),
    },
    {
      key: "cnh",
      header: "Venc. CNH",
      sortValue: (c) => c.cnhExpiry,
      cell: (c) => <CnhBadge expiry={c.cnhExpiry} windowDays={settings.alertWindowDays} />,
    },
    {
      key: "km",
      header: "KM Previsto",
      cell: (c) => (
        <span className="text-xs text-zinc-300 tabular-nums">
          {c.kmMonthly ? `${c.kmMonthly.toLocaleString("pt-BR")} km/mês` : c.kmDaily ? `${c.kmDaily} km/dia` : "—"}
        </span>
      ),
    },
    {
      key: "cnhFile",
      header: "CNH Digital",
      cell: (c) =>
        c.cnhPdfUrl ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <FileText className="size-3.5" /> Anexada
          </span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: "reg",
      header: "Cadastro",
      sortValue: (c) => c.registeredAt,
      cell: (c) => formatDate(c.registeredAt),
    },
  ];

  const v = crud.viewing;
  const history = v
    ? data!.rentals.filter((r) => r.clientId === v.id).sort((a, b) => b.startDate.localeCompare(a.startDate))
    : [];

  return (
    <>
      <PageHeader
        tour="clients"
        title="Clientes"
        description="Cadastro completo de locatários e histórico de contratos."
        actions={
          <Button data-tour="clients-new" onClick={crud.openNew}>
            <Plus /> Novo cliente
          </Button>
        }
      />

      <DataTable
        tour="clients"
        label="Clientes"
        rows={clients}
        columns={columns}
        searchPlaceholder="Buscar por nome, CPF/CNPJ, telefone, cidade ou e-mail"
        searchText={(c) => `${c.name} ${c.cpf} ${c.phone} ${c.email ?? ""} ${c.city ?? ""} ${c.cnhNumber ?? ""}`}
        initialSort={{ key: "code", dir: "desc" }}
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
          {
            key: "docType",
            label: "Tipo",
            options: [
              { value: "cpf", label: "Pessoa Física (CPF)" },
              { value: "cnpj", label: "Pessoa Jurídica (CNPJ)" },
            ],
            predicate: (c, val) => (c.docType ?? "cpf") === val,
          },
        ]}
        onView={(c) => {
          setRevealDoc(false);
          crud.setViewing(c);
        }}
        onEdit={crud.openEdit}
        onDelete={crud.setDeleting}
      />

      {/* Modal de Formulário Completo */}
      <FormDialog
        tour="clients-form"
        open={crud.formOpen}
        onOpenChange={crud.setFormOpen}
        title={crud.editing ? "Editar cliente" : "Novo cliente"}
        onSubmit={submit}
        size="lg"
      >
        {/* Seção 1: Identificação */}
        <div className="border-b border-line pb-2 sm:col-span-2">
          <p data-tour="clients-form-identity" className="text-xs font-semibold uppercase tracking-wider text-brand-soft">1. Identificação</p>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Tipo de documento *</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                set("docType", "cpf");
                set("cpf", "");
              }}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${draft.docType === "cpf" ? "bg-magenta text-white" : "border border-line bg-surface text-muted hover:text-white"}`}
            >
              Pessoa Física (CPF)
            </button>
            <button
              type="button"
              onClick={() => {
                set("docType", "cnpj");
                set("cpf", "");
              }}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${draft.docType === "cnpj" ? "bg-magenta text-white" : "border border-line bg-surface text-muted hover:text-white"}`}
            >
              Pessoa Jurídica (CNPJ)
            </button>
          </div>
        </div>

        <Field label={draft.docType === "cnpj" ? "CNPJ" : "CPF"} htmlFor="f-cpf" required>
          <Input
            {...bind("cpf", (v) => maskDoc(v, draft.docType))}
            required
            inputMode="numeric"
            placeholder={draft.docType === "cnpj" ? "00.000.000/0000-00" : "000.000.000-00"}
          />
        </Field>

        <Field label="Nome completo / Razão social" htmlFor="f-name" required>
          <Input {...bind("name")} required autoComplete="off" placeholder="Nome do titular" />
        </Field>

        <Field label="RG / Órgão emissor" htmlFor="f-rg">
          <Input {...bind("rg")} placeholder="00.000.000-0 SSP/SP" />
        </Field>

        <Field label="Data de cadastro" htmlFor="f-registeredAt">
          <Input {...bind("registeredAt")} type="date" />
        </Field>

        {/* Seção 2: Habilitação e CNH Digital */}
        <div className="mt-2 border-b border-line pb-2 sm:col-span-2">
          <p data-tour="clients-form-cnh" className="text-xs font-semibold uppercase tracking-wider text-brand-soft">2. Habilitação & CNH Digital</p>
        </div>

        <Field label="Nº Registro CNH" htmlFor="f-cnhNumber">
          <Input {...bind("cnhNumber", (v) => v.replace(/\D/g, "").slice(0, 15))} placeholder="00000000000" inputMode="numeric" />
        </Field>

        <Field label="Categoria CNH" htmlFor="f-cnhCategory">
          <Select
            {...bind("cnhCategory")}
            options={[
              { value: "B", label: "B (Carro)" },
              { value: "AB", label: "AB (Carro e Moto)" },
              { value: "A", label: "A (Moto)" },
              { value: "C", label: "C (Caminhão)" },
              { value: "D", label: "D (Ônibus/Van)" },
              { value: "E", label: "E (Articulado)" },
            ]}
          />
        </Field>

        <Field label="Vencimento CNH" htmlFor="f-cnhExpiry">
          <Input {...bind("cnhExpiry")} type="date" />
        </Field>

        <Field label="1ª habilitação" htmlFor="f-firstLicenseDate">
          <Input {...bind("firstLicenseDate")} type="date" max={today} />
        </Field>

        {/* Anexo CNH Digital (PDF exportado do CDT) */}
        <div className="rounded-xl border border-line bg-surface p-4 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Anexar CNH Digital (PDF do app da CDT)</p>
              <p className="text-xs text-muted">PDF exportado diretamente da Carteira Digital de Trânsito ou foto da CNH.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10">
              <FileUp className="size-3.5" />
              <span>{uploadingPdf ? "Enviando..." : "Anexar PDF / Foto"}</span>
              <input
                type="file"
                accept=".pdf,application/pdf,image/jpeg,image/png"
                className="sr-only"
                disabled={uploadingPdf}
                onChange={handleCnhPdfUpload}
              />
            </label>
          </div>
          {draft.cnhPdfUrl && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-400">
              <FileText className="size-4" />
              <span>CNH anexada ({draft.cnhPdfUrl.split("/").pop()})</span>
              <button type="button" onClick={() => set("cnhPdfUrl", "")} className="ml-2 text-red-400 hover:underline">Remover</button>
            </div>
          )}
        </div>

        {/* Seção 3: Estimativa de KM Rodado */}
        <div className="mt-2 border-b border-line pb-2 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-soft">3. Previsão de KM Médio com o Veículo</p>
        </div>

        <Field label="KM Médio por dia" htmlFor="f-kmDaily" hint="Estimativa de uso diário">
          <Input {...bind("kmDaily")} type="number" min={0} placeholder="Ex.: 80" />
        </Field>

        <Field label="KM Médio por mês" htmlFor="f-kmMonthly" hint="Estimativa de uso mensal">
          <Input {...bind("kmMonthly")} type="number" min={0} placeholder="Ex.: 2500" />
        </Field>

        {/* Seção 4: Contatos */}
        <div className="mt-2 border-b border-line pb-2 sm:col-span-2">
          <p data-tour="clients-form-contacts" className="text-xs font-semibold uppercase tracking-wider text-brand-soft">4. Contatos</p>
        </div>

        <Field label="Telefone principal (WhatsApp)" htmlFor="f-phone" required>
          <Input {...bind("phone", maskPhone)} required inputMode="tel" placeholder="(19) 90000-0000" minLength={14} />
        </Field>

        <Field label="Telefone reserva / recado" htmlFor="f-backupPhone">
          <Input {...bind("backupPhone", maskPhone)} inputMode="tel" placeholder="(19) 90000-0000" />
        </Field>

        <Field label="E-mail" htmlFor="f-email" className="sm:col-span-2" hint="Para envio do contrato e cobranças PIX">
          <Input {...bind("email")} type="email" inputMode="email" placeholder="cliente@exemplo.com" />
        </Field>

        {/* Seção 5: Endereço com Auto-busca CEP */}
        <div className="mt-2 border-b border-line pb-2 sm:col-span-2">
          <div className="flex items-center justify-between">
            <p data-tour="clients-form-address" className="text-xs font-semibold uppercase tracking-wider text-brand-soft">5. Endereço Completo</p>
            {lookingUpCep && <span className="text-xs text-brand-soft animate-pulse">Buscando CEP no ViaCEP...</span>}
          </div>
        </div>

        <Field label="CEP" htmlFor="f-cep" hint="Digite o CEP para preencher o endereço">
          <Input
            id="f-cep"
            value={draft.cep}
            onChange={(e) => handleCepChange(e.target.value)}
            placeholder="00000-000"
            inputMode="numeric"
            maxLength={9}
          />
        </Field>

        <Field label="Estado (UF)" htmlFor="f-state">
          <Input {...bind("state")} placeholder="SP" maxLength={2} className="uppercase" />
        </Field>

        <Field label="Cidade" htmlFor="f-city">
          <Input {...bind("city")} placeholder="Indaiatuba" />
        </Field>

        <Field label="Bairro" htmlFor="f-neighborhood">
          <Input {...bind("neighborhood")} placeholder="Centro" />
        </Field>

        <Field label="Logradouro / Rua" htmlFor="f-street" className="sm:col-span-2">
          <Input {...bind("street")} placeholder="Rua / Avenida" />
        </Field>

        <Field label="Número" htmlFor="f-number">
          <Input {...bind("number")} placeholder="123" />
        </Field>

        <Field label="Complemento" htmlFor="f-complement">
          <Input {...bind("complement")} placeholder="Apto 12, Bloco B" />
        </Field>

        <Field label="Observações internas" htmlFor="f-notes" className="sm:col-span-2">
          <Textarea {...bind("notes")} placeholder="Informações adicionais da locadora" />
        </Field>
      </FormDialog>

      {/* Modal de Detalhes do Cliente */}
      <Dialog
        open={!!v}
        onOpenChange={(o) => !o && crud.setViewing(null)}
        title={v?.name ?? ""}
        description={v ? `Cliente #${String(v.code).padStart(3, "0")}` : undefined}
        size="lg"
        footer={v && <Button onClick={() => crud.openEdit(v)}>Editar cadastro</Button>}
      >
        {v && (
          <div className="space-y-6">
            <DetailList
              items={[
                { label: v.docType === "cnpj" ? "CNPJ" : "CPF", value: revealDoc ? v.cpf : hideDoc(v.cpf, v.docType ?? "cpf") },
                { label: "RG", value: v.rg },
                { label: "Telefone", value: v.phone },
                { label: "Telefone reserva", value: v.backupPhone },
                { label: "E-mail", value: v.email },
                { label: "Nº CNH", value: v.cnhNumber },
                { label: "Categoria CNH", value: v.cnhCategory },
                { label: "Vencimento CNH", value: v.cnhExpiry ? formatDate(v.cnhExpiry) : undefined },
                { label: "KM Médio diário", value: v.kmDaily ? `${v.kmDaily} km/dia` : undefined },
                { label: "KM Médio mensal", value: v.kmMonthly ? `${v.kmMonthly.toLocaleString("pt-BR")} km/mês` : undefined },
                { label: "Endereço completo", value: v.address || [v.street, v.number, v.neighborhood, v.city && `${v.city}/${v.state}`, v.cep].filter(Boolean).join(", "), wide: true },
                { label: "Data de cadastro", value: formatDate(v.registeredAt) },
                { label: "Observações", value: v.notes, wide: true },
              ]}
            />

            {v.cnhPdfUrl && (
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-6 text-brand-soft" />
                  <div>
                    <p className="text-sm font-semibold text-white">CNH Digital Anexada</p>
                    <p className="text-xs text-muted">{v.cnhPdfUrl}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const { data: signed } = await getSupabase().storage.from("documentos").createSignedUrl(v.cnhPdfUrl!, 600);
                    if (signed?.signedUrl) window.open(signed.signedUrl, "_blank");
                  }}
                >
                  <ExternalLink className="size-3.5" /> Abrir CNH
                </Button>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Histórico de locações ({history.length})
              </p>
              {!history.length ? (
                <p className="text-xs text-muted">Nenhuma locação registrada.</p>
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                  {history.map((r) => (
                    <li key={r.id} className="flex items-center justify-between p-3 text-xs">
                      <div>
                        <p className="font-semibold text-white">{r.contractType}</p>
                        <p className="text-muted">
                          {formatDate(r.startDate)} a {formatDate(r.endDate)} · Total recebido: {formatCurrency(rentalReceived(r))}
                        </p>
                      </div>
                      <StatusBadge map={RENTAL_STATUS} value={r.status} />
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
        what={`o motorista "${crud.deleting?.name ?? ""}"`}
      />
    </>
  );
}
