"use client";

import { CheckCircle2, ExternalLink, FileText, Image as ImageIcon, Plus, Trash2, Upload, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { FipePicker, fipeApi } from "@/components/admin/fipe-picker";
import { VehicleFipePanel } from "@/components/admin/vehicle-fipe-panel";
import { FIPE_TYPES, type FipeInput, type FipeDetail } from "@/lib/fipe";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { VehicleTrackingPanel } from "@/components/admin/vehicle-tracking-panel";
import { DataTable, type Column } from "@/components/admin/data-table";
import { DetailList, PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { useAdminData } from "@/hooks/use-admin-data";
import { numOrUndef, numToStr, strOrUndef, useCrud } from "@/hooks/use-crud";
import { VEHICLE_STATUS, statusOptions } from "@/lib/constants";
import { parseCrlvPdf } from "@/lib/crlv";
import { getSupabase } from "@/lib/supabase/client";
import { orgPath } from "@/lib/org-path";
import { formatCurrency, formatDate, isValidPlate, maskPlate, newId } from "@/lib/utils";
import type { FleetVehicle, VehicleStatus } from "@/types";

const VEHICLE_TYPES = ["Carro", "Moto"] as const;

const COMMON_COLORS = [
  "Branco",
  "Preto",
  "Prata",
  "Cinza",
  "Vermelho",
  "Azul",
  "Verde",
  "Amarelo",
  "Marrom",
  "Outra",
];

type Draft = {
  plate: string;
  vehicleType: string;
  brand: string;
  model: string;
  year: string;
  yearModel: string;
  fuel: string;
  fipeSelection?: { detail: FipeDetail; parameters: FipeInput };
  renavam: string;
  chassis: string;
  odometer: string;
  color: string;
  licensingDueDate: string;
  purchaseDate: string;
  purchaseValue: string;
  photos: string[];
  crlvUrl: string;
  status: VehicleStatus;
};

const empty = (): Draft => ({
  plate: "",
  vehicleType: "Carro",
  brand: "",
  model: "",
  year: String(new Date().getFullYear()),
  yearModel: "",
  fuel: "Flex",
  renavam: "",
  chassis: "",
  odometer: "0",
  color: "Branco",
  licensingDueDate: "",
  purchaseDate: "",
  purchaseValue: "",
  photos: [],
  crlvUrl: "",
  status: "available",
});

const toDraft = (v: FleetVehicle): Draft => ({
  plate: v.plate,
  vehicleType: v.vehicleType || "Carro",
  brand: v.brand || "",
  model: v.model || "",
  year: String(v.year || new Date().getFullYear()),
  yearModel: v.yearModel ?? "",
  fuel: v.fuel,
  renavam: v.renavam ?? "",
  chassis: v.chassis ?? "",
  odometer: v.odometer != null ? String(v.odometer) : "0",
  color: v.color ?? "",
  licensingDueDate: v.licensingDueDate ?? "",
  purchaseDate: v.purchaseDate ?? "",
  purchaseValue: numToStr(v.purchaseValue),
  photos: Array.isArray(v.photos) ? v.photos : v.image ? [v.image] : [],
  crlvUrl: v.crlvUrl ?? "",
  status: v.status,
});

export default function VehiclesPage() {
  const { data, reload } = useAdminData();
  const crud = useCrud("vehicles", { empty, toDraft, noun: "Veículo" });
  const { draft, bind, set } = crud;
  const vehicles = data!.vehicles;

  const [showFipe, setShowFipe] = useState(false);
  const [readingPdf, setReadingPdf] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingCrlv, setUploadingCrlv] = useState(false);

  // Leitor de CRLV-e inteligente
  const handleCrlvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReadingPdf(true);
    try {
      const parsed = await parseCrlvPdf(file);
      if (parsed.plate) set("plate", maskPlate(parsed.plate));
      if (parsed.renavam) set("renavam", parsed.renavam);
      if (parsed.year) set("year", String(parsed.year));
      if (parsed.yearModel) set("yearModel", parsed.yearModel);
      if (parsed.brand) set("brand", parsed.brand);
      if (parsed.model) set("model", parsed.model);
      if (parsed.vehicleType) set("vehicleType", parsed.vehicleType);

      // Salva o documento no bucket privado 'documentos'
      const ext = file.name.split(".").pop() || "pdf";
      const path = await orgPath(`crlv/${parsed.plate || "doc"}_${Date.now()}.${ext}`);
      const { error: uploadError } = await getSupabase()
        .storage.from("documentos")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      set("crlvUrl", path);

      toast.success("CRLV importado com sucesso! Dados preenchidos automaticamente.");
    } catch {
      toast.error("Não foi possível ler o arquivo. Você pode preencher os dados manualmente.");
    }
    setReadingPdf(false);
    e.target.value = "";
  };

  // Upload avulso ou substituição do Documento CRLV
  const handleDocumentDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCrlv(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = await orgPath(`crlv/${draft.plate || "doc"}_${Date.now()}.${ext}`);
      const { error } = await getSupabase().storage.from("documentos").upload(path, file, { upsert: true });
      if (error) throw error;
      set("crlvUrl", path);
      toast.success("Documento do veículo anexado com sucesso!");
    } catch {
      toast.error("Não foi possível enviar o documento. Tente novamente.");
    }
    setUploadingCrlv(false);
    e.target.value = "";
  };

  // Upload de Múltiplas Fotos do Veículo
  const handlePhotosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingPhotos(true);
    try {
      const newUrls: string[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = await orgPath(`${draft.plate || "veiculo"}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`);
        const { error } = await getSupabase().storage.from("veiculos").upload(path, file, { upsert: true });
        if (error) throw error;
        const { data: pub } = getSupabase().storage.from("veiculos").getPublicUrl(path);
        if (pub?.publicUrl) newUrls.push(pub.publicUrl);
      }
      set("photos", [...draft.photos, ...newUrls]);
      toast.success(`${newUrls.length} foto(s) adicionada(s)!`);
    } catch {
      toast.error("Falha no envio de fotos. Tente novamente.");
    }
    setUploadingPhotos(false);
    e.target.value = "";
  };

  const removePhoto = (indexToRemove: number) => {
    set(
      "photos",
      draft.photos.filter((_, idx) => idx !== indexToRemove)
    );
  };

  const removeDocument = () => {
    set("crlvUrl", "");
    toast.success("Documento removido.");
  };

  // Validação e Submit
  const submit = async () => {
    const normalizedPlate = draft.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (!normalizedPlate) return void toast.error("Informe a placa do veículo.");
    if (!isValidPlate(normalizedPlate)) return void toast.error("Placa inválida. Utilize o formato ABC1234 ou ABC1D23.");

    const duplicatePlate = vehicles.find((v) => v.plate === normalizedPlate && v.id !== crud.editing?.id);
    if (duplicatePlate) return void toast.error(`Já existe um veículo cadastrado com a placa ${normalizedPlate}.`);

    if (!draft.brand.trim()) return void toast.error("Informe a marca do veículo.");
    if (!draft.model.trim()) return void toast.error("Informe o modelo do veículo.");

    const yearNum = Number(draft.year);
    const maxYear = new Date().getFullYear() + 2;
    if (!yearNum || yearNum < 1950 || yearNum > maxYear) {
      return void toast.error(`Informe um ano válido entre 1950 e ${maxYear}.`);
    }

    const cleanChassis = draft.chassis.trim().toUpperCase();
    if (cleanChassis) {
      const duplicateChassis = vehicles.find((v) => v.chassis && v.chassis.trim().toUpperCase() === cleanChassis && v.id !== crud.editing?.id);
      if (duplicateChassis) return void toast.error(`Já existe um veículo cadastrado com o chassi ${cleanChassis}.`);
    }

    const odoNum = Number(draft.odometer.replace(/\D/g, ""));
    if (Number.isNaN(odoNum) || odoNum < 0) {
      return void toast.error("O hodômetro não pode ser negativo.");
    }

    // Se estiver editando e o hodômetro foi reduzido
    if (crud.editing && crud.editing.odometer != null && odoNum < crud.editing.odometer) {
      if (!confirm(`Atenção: A quilometragem informada (${odoNum.toLocaleString("pt-BR")} km) é menor que a anterior (${crud.editing.odometer.toLocaleString("pt-BR")} km). Deseja continuar?`)) {
        return;
      }
    }

    const brandName = draft.brand.trim();
    const modelName = draft.model.trim();
    const fullName = `${brandName} ${modelName}`;
    if (draft.fipeSelection && (brandName !== draft.fipeSelection.detail.brand || draft.yearModel !== String(draft.fipeSelection.detail.modelYear) && draft.fipeSelection.detail.modelYear !== 32000 || draft.vehicleType !== FIPE_TYPES[draft.fipeSelection.detail.type].label || draft.fuel !== draft.fipeSelection.detail.fuel)) { toast.error("Os dados mudaram após a seleção FIPE. Selecione a versão novamente ou preencha manualmente."); return; }
    const mainImage = draft.photos[0] || crud.editing?.image || "/logos/locakar-circular.png";

    if (crud.editing?.fipe && [draft.brand.trim() !== crud.editing.brand, draft.model.trim() !== crud.editing.model, yearNum !== crud.editing.year, draft.yearModel !== (crud.editing.yearModel ?? ""), draft.vehicleType !== crud.editing.vehicleType, draft.fuel !== crud.editing.fuel].some(Boolean) && !confirm("A identidade do veículo mudou. O vínculo FIPE atual será removido; o histórico ficará preservado. Continuar?")) return;
    const id = crud.editing?.id ?? newId();
    const saved = await crud.save({
      id,
      name: fullName,
      brand: brandName,
      model: modelName,
      year: yearNum,
      yearModel: strOrUndef(draft.yearModel),
      plate: normalizedPlate,
      vehicleType: draft.vehicleType,
      chassis: strOrUndef(cleanChassis),
      odometer: odoNum,
      color: strOrUndef(draft.color),
      licensingDueDate: strOrUndef(draft.licensingDueDate),
      purchaseDate: strOrUndef(draft.purchaseDate),
      purchaseValue: numOrUndef(draft.purchaseValue),
      photos: draft.photos,
      crlvUrl: strOrUndef(draft.crlvUrl),
      image: mainImage,
      status: draft.status,
      // Campos compatíveis do banco preservados com valores consistentes
      category: draft.vehicleType === "Moto" ? "Moto" : "Carro",
      transmission: crud.editing?.transmission || "Manual",
      fuel: draft.fuel,
      seats: crud.editing?.seats || (draft.vehicleType === "Moto" ? 2 : 5),
      airConditioning: crud.editing?.airConditioning != null ? crud.editing.airConditioning : draft.vehicleType !== "Moto",
      renavam: strOrUndef(draft.renavam),
      ipvaStatus: crud.editing?.ipvaStatus || "open",
      licensingStatus: crud.editing?.licensingStatus || "open",
    });
    if (saved && draft.fipeSelection && isSupabaseEnabled) {
      try { await fipeApi("vehicles", { action: "link", vehicleId: id, parameters: draft.fipeSelection.parameters }); await reload("vehicles", id); toast.success("FIPE vinculada ao veículo."); }
      catch(e) { toast.error(`Veículo salvo, mas a FIPE não foi vinculada: ${(e as Error).message}`); }
    }
  };

  const columns: Column<FleetVehicle>[] = [
    {
      key: "vehicle",
      header: "Veículo",
      sortValue: (v) => v.name,
      cell: (v) => (
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-surface">
            <Image
              src={v.photos?.[0] || v.image || "/logos/locakar-circular.png"}
              alt={v.name}
              fill
              sizes="64px"
              className="object-contain p-1"
            />
          </div>
          <div>
            <p className="font-semibold text-white">{v.name}</p>
            <p className="text-xs text-muted">
              {v.vehicleType} · {v.color || "Sem cor"} · {v.year}
              {v.fipePrice ? <span className="block text-xs">FIPE {formatCurrency(v.fipePrice)} · {v.fipeReferenceMonth}</span> : null}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "plate",
      header: "Placa",
      sortValue: (v) => v.plate,
      cell: (v) => <span className="font-mono text-xs font-bold tracking-wider text-brand-soft">{v.plate}</span>,
    },
    {
      key: "odometer",
      header: "Hodômetro",
      sortValue: (v) => v.odometer ?? 0,
      cell: (v) => (
        <span className="font-medium tabular-nums text-zinc-300">
          {v.odometer != null ? `${v.odometer.toLocaleString("pt-BR")} km` : "0 km"}
        </span>
      ),
    },
    {
      key: "licensingDueDate",
      header: "Venc. Licenciamento",
      sortValue: (v) => v.licensingDueDate ?? "",
      cell: (v) => (v.licensingDueDate ? formatDate(v.licensingDueDate) : <span className="text-muted">—</span>),
    },
    {
      key: "purchaseValue",
      header: "Valor de Compra",
      sortValue: (v) => v.purchaseValue ?? 0,
      cell: (v) => (v.purchaseValue ? formatCurrency(v.purchaseValue) : <span className="text-muted">—</span>),
      className: "text-right",
    },
    {
      key: "status",
      header: "Status",
      sortValue: (v) => v.status,
      cell: (v) => <StatusBadge map={VEHICLE_STATUS} value={v.status} />,
    },
  ];

  const v = crud.viewing;

  const openSignedDocument = async (path: string) => {
    try {
      const { data: signed } = await getSupabase().storage.from("documentos").createSignedUrl(path, 600);
      if (signed?.signedUrl) {
        window.open(signed.signedUrl, "_blank");
      } else {
        toast.error("Não foi possível gerar link do documento.");
      }
    } catch {
      toast.error("Erro ao abrir documento.");
    }
  };

  return (
    <>
      <PageHeader
        title="Veículos"
        description="Gestão completa da frota: cadastro, documentos, fotos e manutenção."
        actions={
          <Button onClick={() => { setShowFipe(false); crud.openNew(); }}>
            <Plus /> Novo veículo
          </Button>
        }
      />

      <DataTable
        label="Veículos"
        rows={vehicles}
        columns={columns}
        searchPlaceholder="Buscar por placa, marca ou modelo"
        searchText={(v) => `${v.plate} ${v.brand} ${v.model} ${v.name} ${v.chassis ?? ""} ${v.renavam ?? ""}`}
        initialSort={{ key: "plate", dir: "asc" }}
        filters={[
          { key: "status", label: "Status", options: statusOptions(VEHICLE_STATUS), predicate: (v, val) => v.status === val },
          {
            key: "type",
            label: "Tipo",
            options: [
              { value: "Carro", label: "Carro" },
              { value: "Moto", label: "Moto" },
            ],
            predicate: (v, val) => v.vehicleType === val,
          },
        ]}
        onView={crud.setViewing}
        onEdit={crud.openEdit}
        onDelete={crud.setDeleting}
      />

      {/* Cadastro simplificado: 14 campos, assistência FIPE opcional. */}
      <FormDialog
        open={crud.formOpen}
        onOpenChange={crud.setFormOpen}
        title={crud.editing ? `Editar veículo · ${crud.editing.plate}` : "Novo veículo"}
        description="Preencha os dados do veículo da frota."
        onSubmit={submit}
        size="lg"
      >
        {/* Bloco Auxiliar: Leitor inteligente de CRLV-e */}
        <div className="rounded-xl border border-magenta/30 bg-magenta/5 p-4 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Importar dados do CRLV-e (PDF / Foto)</p>
              <p className="text-xs text-muted">
                Envie o documento digital exportado do aplicativo oficial para preencher placa, Renavam, marca, modelo e ano automaticamente.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-magenta/40 bg-magenta/20 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-magenta/30">
              <Upload className="size-3.5" />
              <span>{readingPdf ? "Lendo documento..." : "Importar CRLV-e"}</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={readingPdf}
                onChange={handleCrlvUpload}
              />
            </label>
          </div>
        </div>

        {/* 1. PLACA */}
        <Field label="1. Placa" htmlFor="f-plate" required hint="Padrão Mercosul (ABC1D23) ou tradicional (ABC1234)">
          <Input
            {...bind("plate", maskPlate)}
            placeholder="ABC1D23"
            required
            autoCapitalize="characters"
            className="font-mono uppercase"
          />
        </Field>

        <div className="grid gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => { toast.message("Consulta por placa não configurada. Localize o veículo pela Tabela FIPE ou preencha manualmente."); setShowFipe(true); }}>Consultar veículo</Button><Button type="button" variant="ghost" onClick={() => { setShowFipe(!showFipe); if(showFipe) set("fipeSelection", undefined); }}>{showFipe ? "Preencher manualmente" : "Buscar na FIPE"}</Button></div>
        {showFipe && <FipePicker initialType={draft.vehicleType === "Moto" ? "motorcycles" : "cars"} onUse={(d,p) => { set("vehicleType", FIPE_TYPES[d.type].label); set("brand", d.brand); if (!draft.model.trim()) set("model", d.model); if(d.modelYear !== 32000) set("yearModel", String(d.modelYear)); set("fuel", d.fuel); set("fipeSelection", { detail: d, parameters: p }); toast.success("Versão selecionada. Fabricação, Renavam, chassi e compra continuam manuais."); }} />}
        {draft.fipeSelection && <p className="text-xs text-muted sm:col-span-2">Versão FIPE: {draft.fipeSelection.detail.model} · código {draft.fipeSelection.detail.code}. Ano modelo: {draft.yearModel || "Zero KM"}; fabricação é o campo 5.</p>}

        {/* 2. TIPO DE VEÍCULO */}
        <Field label="2. Tipo de Veículo" htmlFor="f-vehicleType" required>
          <Select
            {...bind("vehicleType")}
            options={[...VEHICLE_TYPES, "Caminhão"].map((t) => ({ value: t, label: t }))}
            required
          />
        </Field>

        {/* 3. MARCA */}
        <Field label="3. Marca" htmlFor="f-brand" required hint="Ex.: Fiat, Renault, Chevrolet, Honda, Yamaha, Toyota...">
          <Input
            id="f-brand"
            name="brand"
            value={draft.brand}
            onChange={(e) => set("brand", e.target.value)}
            placeholder="Ex.: Fiat, Honda, Toyota..."
            required
          />

        </Field>

        {/* 4. MODELO */}
        <Field label="4. Modelo" htmlFor="f-model" required hint="Ex.: Mobi, Kwid, Onix, HB20, CG 160, Factor...">
          <Input
            id="f-model"
            name="model"
            value={draft.model}
            onChange={(e) => set("model", e.target.value)}
            placeholder="Ex.: Mobi, Kwid, CG 160..."
            required
          />
        </Field>

        {/* 5. ANO */}
        <Field label="5. Ano de Fabricação" htmlFor="f-year" required hint="Ano do veículo (1950 até atual + 2)">
          {draft.yearModel && <p className="text-xs text-muted">Ano modelo selecionado: {draft.yearModel} (diferente da fabricação).</p>}
          <Input
            {...bind("year")}
            type="number"
            min={1950}
            max={new Date().getFullYear() + 2}
            placeholder={String(new Date().getFullYear())}
            required
          />
        </Field>

        {crud.editing?.fipe && <p className="text-xs text-muted sm:col-span-2">Vínculo FIPE atual: {crud.editing.fipe.version} · ano modelo {crud.editing.fipe.modelYear}. Alterar marca, modelo, fabricação, ano modelo, tipo ou combustível invalida o vínculo e preserva o histórico.</p>}
        <div className="grid grid-cols-2 gap-3 sm:col-span-2"><Field label="Ano modelo (opcional)" htmlFor="f-yearModel" hint="FIPE utiliza ano modelo, não fabricação."><Input {...bind("yearModel")} inputMode="numeric" /></Field><Field label="Combustível" htmlFor="f-fuel"><Input {...bind("fuel")} /></Field></div>

        {/* 6. RENAVAM */}
        <Field label="6. Renavam" htmlFor="f-renavam" hint="Código Renavam (apenas números)">
          <Input
            {...bind("renavam", (x) => x.replace(/\D/g, "").slice(0, 11))}
            placeholder="00000000000"
            inputMode="numeric"
            maxLength={11}
          />
        </Field>

        {/* 7. CHASSI */}
        <Field label="7. Chassi" htmlFor="f-chassis" hint="Número de identificação do chassi (17 caracteres)">
          <Input
            id="f-chassis"
            name="chassis"
            value={draft.chassis}
            onChange={(e) => set("chassis", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17))}
            placeholder="9BWZZZ377VT000000"
            className="font-mono uppercase"
            maxLength={17}
          />
        </Field>

        {/* 8. HODÔMETRO */}
        <Field label="8. Hodômetro (KM atual)" htmlFor="f-odometer" required hint="Quilometragem atual do veículo">
          <Input
            id="f-odometer"
            name="odometer"
            value={draft.odometer}
            onChange={(e) => {
              const num = e.target.value.replace(/\D/g, "");
              set("odometer", num ? Number(num).toLocaleString("pt-BR") : "");
            }}
            placeholder="Ex.: 45.230"
            inputMode="numeric"
            required
          />
        </Field>

        {/* 9. COR */}
        <Field label="9. Cor" htmlFor="f-color" hint="Ex.: Branco, Preto, Prata, Vermelho...">
          <Input
            id="f-color"
            name="color"
            value={draft.color}
            onChange={(e) => set("color", e.target.value)}
            placeholder="Ex.: Branco, Preto, Prata..."
            list="color-suggestions"
          />
          <datalist id="color-suggestions">
            {COMMON_COLORS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        {/* 10. VENCIMENTO DO LICENCIAMENTO */}
        <Field label="10. Vencimento do Licenciamento" htmlFor="f-licensingDueDate" hint="Data limite para o licenciamento anual">
          <Input {...bind("licensingDueDate")} type="date" />
        </Field>

        {/* 11. DATA DA COMPRA */}
        <Field label="11. Data da Compra" htmlFor="f-purchaseDate" hint="Data de aquisição pela locadora">
          <Input {...bind("purchaseDate")} type="date" />
        </Field>

        {/* 12. VALOR (VALOR DE COMPRA) */}
        <Field label="12. Valor Pago / Investido (R$)" htmlFor="f-purchaseValue" hint="Valor de compra do veículo (R$)">
          <Input
            {...bind("purchaseValue")}
            type="number"
            min={0}
            step="0.01"
            placeholder="Ex.: 45900.00"
          />
        </Field>

        {/* 13. FOTOS DO VEÍCULO (Múltiplas Fotos) */}
        <div className="rounded-xl border border-line bg-surface p-4 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">13. Fotos do Veículo</p>
              <p className="text-xs text-muted">
                Envie fotos em boa qualidade (Frente, Traseira, Laterais, Interior, Hodômetro). A primeira foto será a foto principal.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10">
              <ImageIcon className="size-3.5" />
              <span>{uploadingPhotos ? "Enviando fotos..." : "Adicionar fotos"}</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadingPhotos}
                onChange={handlePhotosUpload}
              />
            </label>
          </div>

          {draft.photos.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {draft.photos.map((url, idx) => (
                <div key={idx} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Foto ${idx + 1}`} className="size-full object-cover" />
                  {idx === 0 && (
                    <span className="absolute bottom-1 left-1 rounded bg-magenta/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      Principal
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-red-600/90 text-white opacity-90 transition-opacity hover:opacity-100"
                    title="Remover foto"
                    aria-label={`Remover foto ${idx + 1}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs italic text-muted">Nenhuma foto adicionada ainda.</p>
          )}
        </div>

        {/* 14. DOCUMENTO DO VEÍCULO (CRLV) */}
        <div className="rounded-xl border border-line bg-surface p-4 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">14. Documento do Veículo (CRLV)</p>
              <p className="text-xs text-muted">
                Anexe o CRLV em PDF ou imagem (JPG/PNG). O documento fica protegido no armazenamento seguro da locadora.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10">
              <FileText className="size-3.5" />
              <span>{uploadingCrlv ? "Enviando..." : draft.crlvUrl ? "Substituir documento" : "Anexar documento"}</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadingCrlv}
                onChange={handleDocumentDirectUpload}
              />
            </label>
          </div>

          {draft.crlvUrl ? (
            <div className="mt-3 flex items-center justify-between rounded-lg border border-line-strong bg-ink/60 p-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <div>
                  <p className="text-xs font-semibold text-white">Documento anexado</p>
                  <p className="text-[11px] text-muted truncate max-w-xs">{draft.crlvUrl}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => openSignedDocument(draft.crlvUrl)}>
                  <ExternalLink className="size-3.5" /> Visualizar
                </Button>
                <Button size="sm" variant="danger" onClick={removeDocument} title="Remover documento">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs italic text-muted">Nenhum documento anexado ainda.</p>
          )}
        </div>
      </FormDialog>

      {/* Modal de Detalhes do Veículo */}
      <Dialog
        open={!!v}
        onOpenChange={(o) => !o && crud.setViewing(null)}
        title={v ? `${v.name} · ${v.plate}` : ""}
        size="lg"
        footer={v && <Button onClick={() => crud.openEdit(v)}>Editar veículo</Button>}
      >
        {v && (
          <div className="space-y-6">
            {/* Galeria de Fotos */}
            {v.photos && v.photos.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Galeria de Fotos</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {v.photos.map((src, idx) => (
                    <div key={idx} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-surface">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt={`Foto ${idx + 1}`} className="size-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            ) : v.image ? (
              <div className="relative aspect-[16/9] max-h-56 overflow-hidden rounded-xl border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.image} alt={v.name} className="size-full object-contain p-2" />
              </div>
            ) : null}

            {/* Raio-X com todos os campos */}
            <DetailList
              items={[
                { label: "Status", value: <StatusBadge map={VEHICLE_STATUS} value={v.status} /> },
                { label: "Placa", value: <span className="font-mono font-bold tracking-wider text-brand-soft">{v.plate}</span> },
                { label: "Tipo de Veículo", value: v.vehicleType || "Carro" },
                { label: "Marca", value: v.brand },
                { label: "Modelo", value: v.model },
                { label: "Ano de Fabricação", value: String(v.year) },
                { label: "Cor", value: v.color || "—" },
                { label: "Hodômetro atual", value: v.odometer != null ? `${v.odometer.toLocaleString("pt-BR")} km` : "0 km" },
                { label: "Chassi", value: v.chassis || "—" },
                { label: "Renavam", value: v.renavam || "—" },
                { label: "Venc. Licenciamento", value: v.licensingDueDate ? formatDate(v.licensingDueDate) : "—" },
                { label: "Data da Compra", value: v.purchaseDate ? formatDate(v.purchaseDate) : "—" },
                { label: "Valor de Compra", value: v.purchaseValue ? formatCurrency(v.purchaseValue) : "—" },
              ]}
            />

            <VehicleFipePanel key={`fipe-${v.id}`} vehicleId={v.id} onChanged={() => reload("vehicles", v.id)} />
            <VehicleTrackingPanel key={v.id} vehicle={v} />

            {/* Documento CRLV */}
            {v.crlvUrl && (
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-6 text-brand-soft" />
                  <div>
                    <p className="text-sm font-semibold text-white">Documento do Veículo (CRLV)</p>
                    <p className="text-xs text-muted truncate max-w-sm">{v.crlvUrl}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openSignedDocument(v.crlvUrl!)}>
                  <ExternalLink className="size-3.5" /> Abrir documento
                </Button>
              </div>
            )}
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
