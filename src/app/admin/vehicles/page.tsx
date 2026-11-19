"use client";

import { CheckCircle2, ExternalLink, FileText, Image as ImageIcon, Plus, Trash2, Upload, X } from "lucide-react";
import { VehiclePhoto } from "@/components/ui/vehicle-photo";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { fipeApi } from "@/components/admin/fipe-picker";
import { VehicleFipeAuto } from "@/components/admin/vehicle-fipe-auto";
import { VehicleCatalogField } from "@/components/admin/vehicle-catalog-field";
import { fipeSelectionValid, vehicleFipeIdentity } from "@/lib/vehicle-fipe";
import { normalizeFuel, VEHICLE_FUELS } from "@/lib/vehicle-input";
import { VehicleFipePanel } from "@/components/admin/vehicle-fipe-panel";
import { type FipeInput, type FipeDetail } from "@/lib/fipe";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { VehicleTrackingPanel } from "@/components/admin/vehicle-tracking-panel";
import { DataTable, type Column } from "@/components/admin/data-table";
import { DetailList, PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { useAdminData } from "@/hooks/use-admin-data";
import { usePlanFeature } from "@/hooks/use-organization";
import { numOrUndef, numToStr, strOrUndef, useCrud } from "@/hooks/use-crud";
import { VEHICLE_STATUS, statusOptions } from "@/lib/constants";
import { crlvFields, parseCrlvPdf } from "@/lib/crlv";
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
  fipeSelection?: { detail: FipeDetail; parameters: FipeInput; identity: string };
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
  year: "",
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
  year: v.year ? String(v.year) : "",
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
  const trackingOn = usePlanFeature("tracking_selsyn");
  const crud = useCrud("vehicles", { empty, toDraft, noun: "Veículo" });
  const { draft, bind, set } = crud;
  const vehicles = data!.vehicles;

  const [crlvMessage, setCrlvMessage] = useState("Aguardando arquivo.");
  const generation = useRef(0);
  const reading = useRef<AbortController | null>(null);
  const latestDraft = useRef(draft);
  useEffect(() => { latestDraft.current = draft; }, [draft]);
  const openNew = () => { generation.current++; reading.current?.abort(); setReadingPdf(false); crud.openNew(); setCrlvMessage("Aguardando arquivo."); };
  const openEdit = (v: FleetVehicle) => { generation.current++; reading.current?.abort(); setReadingPdf(false); crud.openEdit(v); setCrlvMessage("Aguardando arquivo."); };
  const changeOpen = (open: boolean) => { if (!open) { generation.current++; reading.current?.abort(); } crud.setFormOpen(open); };
  useEffect(() => () => reading.current?.abort(), []);
  const [readingPdf, setReadingPdf] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadingCrlv, setUploadingCrlv] = useState(false);

  // Leitor de CRLV-e inteligente
  const handleCrlvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const requestGeneration = generation.current;
    const before = latestDraft.current;
    const controller = new AbortController(); reading.current?.abort(); reading.current = controller;
    setReadingPdf(true); setCrlvMessage("Processando documento…");
    try {
      const parsed = await parseCrlvPdf(file, { signal: controller.signal, onProgress: setCrlvMessage });
      if (controller.signal.aborted || generation.current !== requestGeneration) return;
      const patch: Partial<Draft> = {};
      for (const key of ["renavam","brand","model","vehicleType","fuel","chassis","color","yearModel"] as const) if (parsed[key]) patch[key] = parsed[key]!;
      if (parsed.plate) patch.plate = maskPlate(parsed.plate);
      if (parsed.year) patch.year = String(parsed.year);
      const fields = crlvFields(parsed);
      const changed = Object.keys(patch).some(key => latestDraft.current[key as keyof Draft] !== before[key as keyof Draft]);
      if (changed) { setCrlvMessage("Dados encontrados, mas o formulário mudou durante a leitura. Importe novamente para não sobrescrever alterações."); return; }
      crud.setDraft(prev => ({ ...prev, ...patch, fipeSelection: undefined }));
      setCrlvMessage(`Dados encontrados: ${fields.join(", ")}. Confira os campos antes de salvar.`);
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = await orgPath(`crlv/${newId()}.${ext}`);
      const { error } = await getSupabase().storage.from("documentos").upload(path, file, { upsert: false });
      if (controller.signal.aborted || generation.current !== requestGeneration) return;
      if (error) { toast.warning("Dados lidos, mas o documento não foi anexado. Tente anexá-lo novamente."); return; }
      set("crlvUrl", path);
      toast.success(`CRLV: ${fields.length} campos identificados. Revise os dados preenchidos.`);
    } catch (err) {
      if (!controller.signal.aborted && generation.current === requestGeneration) {
        setCrlvMessage((err as Error).message || "Erro ao processar documento.");
        toast.error((err as Error).message || "Não foi possível ler o documento. Preencha manualmente.");
      }
    } finally { if (generation.current === requestGeneration) setReadingPdf(false); e.target.value = ""; }
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
    const requestGeneration = generation.current;
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploadingPhotos(true);
    try {
      const newUrls: string[] = [];
      for (const file of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error("Use JPG, PNG ou WebP de até 8 MB.");
        const bitmap = await createImageBitmap(file); const pixels = bitmap.width * bitmap.height; bitmap.close();
        if (pixels > 32_000_000) throw new Error("Imagem muito grande. Reduza a resolução antes de anexar.");
        if (generation.current !== requestGeneration) return;
        const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = await orgPath(`${draft.plate || "veiculo"}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`);
        const { error } = await getSupabase().storage.from("veiculos").upload(path, file, { upsert: true });
        if (error) throw error;
        const { data: pub } = getSupabase().storage.from("veiculos").getPublicUrl(path);
        if (pub?.publicUrl) newUrls.push(pub.publicUrl);
      }
      if (generation.current !== requestGeneration) return;
      crud.setDraft(prev => ({ ...prev, photos: [...prev.photos, ...newUrls] }));
      toast.success(`${newUrls.length} foto(s) adicionada(s)!`);
    } catch (err) {
      toast.error((err as Error).message || "Falha no envio de fotos. Tente novamente.");
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
    const selection = draft.fipeSelection && fipeSelectionValid(draft, draft.fipeSelection) ? draft.fipeSelection : undefined;
    const mainImage = draft.photos[0] || "/logos/locakar-circular.png";

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
    if (saved && selection && isSupabaseEnabled) {
      try { await fipeApi("vehicles", { action: "link", vehicleId: id, parameters: selection.parameters }); await reload("vehicles", id); toast.success("FIPE vinculada ao veículo."); }
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
            <VehiclePhoto
              src={v.photos?.[0] || v.image || "/logos/locakar-circular.png"}
              alt={v.name}
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
        tour="vehicles"
        title="Veículos"
        description="Gestão completa da frota: cadastro, documentos, fotos e manutenção."
        actions={
          <Button data-tour="vehicles-new" onClick={openNew}>
            <Plus /> Novo veículo
          </Button>
        }
      />

      <DataTable
        tour="vehicles"
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
        onEdit={openEdit}
        onDelete={crud.setDeleting}
      />

      {/* Cadastro simplificado: 14 campos, assistência FIPE opcional. */}
      <FormDialog
        tour="vehicles-form"
        open={crud.formOpen}
        onOpenChange={changeOpen}
        title={crud.editing ? `Editar veículo · ${crud.editing.plate}` : "Novo veículo"}
        description="Preencha os dados do veículo da frota."
        onSubmit={submit}
        size="lg"
      >
        {/* Bloco Auxiliar: Leitor inteligente de CRLV-e */}
        <div data-tour="vehicles-form-crlv" className="rounded-xl border border-magenta/30 bg-magenta/5 p-4 sm:col-span-2">
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
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                disabled={readingPdf}
                onChange={handleCrlvUpload}
              />
            </label>
          </div>
          <p role="status" className="mt-2 text-xs text-muted">{crlvMessage}</p>
        </div>

        {/* 1. PLACA */}
        <Field label="Placa" htmlFor="f-plate" required hint="Padrão Mercosul (ABC1D23) ou tradicional (ABC1234)">
          <Input
            {...bind("plate", maskPlate)}
            placeholder="ABC1D23"
            required
            autoCapitalize="characters"
            className="font-mono uppercase"
          />
        </Field>

        {/* 2. TIPO DE VEÍCULO */}
        <Field label="Tipo de veículo" htmlFor="f-vehicleType" required className="sm:col-span-2">
          <Select
            {...bind("vehicleType")}
            options={[...VEHICLE_TYPES, "Caminhão"].map((t) => ({ value: t, label: t }))}
            required
          />
        </Field>

        <Field label="Fabricante" htmlFor="f-brand" required>
          <VehicleCatalogField kind="brand" type={draft.vehicleType} value={draft.brand} onChange={v => set("brand", v)} id="f-brand" />
        </Field>
        <Field label="Modelo" htmlFor="f-model" required>
          <VehicleCatalogField kind="model" type={draft.vehicleType} brand={draft.brand} value={draft.model} onChange={v => set("model", v)} id="f-model" />
        </Field>
        {/* 5. ANO */}
        <Field label="Ano de fabricação" htmlFor="f-year" required hint="Ano do veículo (1950 até atual + 2)">
          <Input
            {...bind("year")}
            type="number"
            min={1950}
            max={new Date().getFullYear() + 2}
            placeholder="Ano de fabricação"
            required
          />
        </Field>

        <Field label="Ano modelo" htmlFor="f-yearModel" hint="Ano modelo é diferente do ano de fabricação."><Input {...bind("yearModel")} inputMode="numeric" /></Field>
        <Field label="Combustível" htmlFor="f-fuel" className="sm:col-span-2"><Select {...bind("fuel")} options={[...new Set([...VEHICLE_FUELS, draft.fuel])].filter(Boolean).map(value => ({ value, label: value }))} /></Field>
        {/* 6. RENAVAM */}
        <Field label="Renavam" htmlFor="f-renavam" hint="Código Renavam (apenas números)">
          <Input
            {...bind("renavam", (x) => x.replace(/\D/g, "").slice(0, 11))}
            placeholder="00000000000"
            inputMode="numeric"
            maxLength={11}
          />
        </Field>

        {/* 7. CHASSI */}
        <Field label="Chassi" htmlFor="f-chassis" hint="Número de identificação do chassi (17 caracteres)">
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
        <Field label="Hodômetro (KM atual)" htmlFor="f-odometer" required hint="Quilometragem atual do veículo">
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
        <Field label="Cor" htmlFor="f-color" hint="Ex.: Branco, Preto, Prata, Vermelho...">
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
        <Field label="Vencimento do licenciamento" htmlFor="f-licensingDueDate" className="sm:col-span-2" hint="Data limite para o licenciamento anual">
          <Input {...bind("licensingDueDate")} type="date" />
        </Field>

        {/* 11. DATA DA COMPRA */}
        <Field label="Data da compra" htmlFor="f-purchaseDate" hint="Data de aquisição pela locadora">
          <Input {...bind("purchaseDate")} type="date" />
        </Field>

        {/* 12. VALOR (VALOR DE COMPRA) */}
        <Field label="Valor da compra (R$)" htmlFor="f-purchaseValue" hint="Valor de compra do veículo (R$)">
          <Input
            {...bind("purchaseValue")}
            type="number"
            min={0}
            step="0.01"
            placeholder="Ex.: 45900.00"
          />
        </Field>

        <VehicleFipeAuto vehicle={draft} existing={!!crud.editing?.fipe} onMatch={(detail, parameters, identity) => {
          if (vehicleFipeIdentity(latestDraft.current) !== identity) return;
          crud.setDraft(prev => ({ ...prev, fuel: normalizeFuel(prev.fuel), fipeSelection: { detail, parameters, identity } }));
        }} />
        {/* 13. FOTOS DO VEÍCULO (Múltiplas Fotos) */}
        <div data-tour="vehicles-form-photos" className="rounded-xl border border-line bg-surface p-4 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Fotos do veículo</p>
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
                  <VehiclePhoto src={url} alt={`Foto ${idx + 1}`} sizes="120px" className="object-cover" />
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
        <div data-tour="vehicles-form-document" className="rounded-xl border border-line bg-surface p-4 sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Documento do veículo (CRLV)</p>
              <p className="text-xs text-muted">
                Anexe o CRLV em PDF ou imagem (JPG/PNG). O documento fica protegido no armazenamento seguro da locadora.
              </p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line-strong bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10">
              <FileText className="size-3.5" />
              <span>{uploadingCrlv ? "Enviando..." : draft.crlvUrl ? "Substituir documento" : "Anexar documento"}</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
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
                      <VehiclePhoto src={src} alt={`Foto ${idx + 1}`} sizes="(min-width: 640px) 25vw, 50vw" className="object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            ) : v.image ? (
              <div className="relative aspect-[16/9] max-h-56 overflow-hidden rounded-xl border border-line bg-surface">
                <VehiclePhoto src={v.image} alt={v.name} sizes="640px" className="object-contain p-2" />
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
            {trackingOn && <VehicleTrackingPanel key={v.id} vehicle={v} />}

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
