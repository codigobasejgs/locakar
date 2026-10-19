"use client";
import { useEffect, useRef, useState } from "react";
import { fipeApi } from "./fipe-picker";
import { Select } from "@/components/ui/form";
import { FIPE_TYPES, type FipeDetail, type FipeInput, type FipeOption, type FipeType } from "@/lib/fipe";
import { fipeModelCandidates, vehicleFipeIdentity, type VehicleFipeIdentity } from "@/lib/vehicle-fipe";
import { normalizeFuel, normalizeVehicleText } from "@/lib/vehicle-input";
import { formatCurrency } from "@/lib/utils";

type Choice = { label: string; parameters: FipeInput };
type Status = "waiting" | "searching" | "matched" | "multiple" | "not_found" | "error";
export function VehicleFipeAuto({ vehicle, existing, onMatch }: { vehicle: VehicleFipeIdentity; existing?: boolean; onMatch: (detail: FipeDetail, parameters: FipeInput, identity: string) => void }) {
  const identity = vehicleFipeIdentity(vehicle);
  const initial = useRef(identity), current = useRef(identity), callback = useRef(onMatch);
  const [status, setStatus] = useState<Status>(existing ? "matched" : "waiting");
  const [detail, setDetail] = useState<FipeDetail | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selecting = useRef<AbortController | null>(null);
  useEffect(() => { current.current = identity; callback.current = onMatch; }, [identity, onMatch]);
  useEffect(() => {
    if (existing && identity === initial.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const type = Object.entries(FIPE_TYPES).find(([,t]) => t.label === vehicle.vehicleType)?.[0] as FipeType | undefined;
      if (!type || !vehicle.brand.trim() || !vehicle.model.trim() || !/^\d{4}$/.test(vehicle.yearModel) || !vehicle.fuel.trim()) { setStatus("waiting"); setDetail(null); setChoices([]); return; }
      setStatus("searching"); setError(null); setDetail(null); setChoices([]);
      const query = async <T,>(operation: string, parameters: FipeInput) => (await fipeApi<{ data: T }>("query", { operation, parameters }, controller.signal)).data;
      try {
        const brands = await query<FipeOption[]>("brands", { type });
        const brand = brands.filter(b => normalizeVehicleText(b.name) === normalizeVehicleText(vehicle.brand));
        if (brand.length !== 1) { setStatus("not_found"); return; }
        const models = fipeModelCandidates(await query<FipeOption[]>("models", { type, brandId: brand[0].code }), vehicle.model);
        // Não varrer centenas de versões: pede modelo mais específico, sem associação silenciosa.
        if (!models.length || models.length > 20) { setStatus("not_found"); return; }
        const candidates: Choice[] = [];
        for (const model of models) {
          const years = await query<FipeOption[]>("years", { type, brandId: brand[0].code, modelId: model.code });
          const matching = years.filter(y => y.code.split("-")[0] === vehicle.yearModel && normalizeVehicleText(normalizeFuel(y.name)) === normalizeVehicleText(normalizeFuel(vehicle.fuel)));
          // O rótulo contém o ano; compara combustível sem presumir códigos de enum.
          const fuels = matching.length ? matching : years.filter(y => y.code.split("-")[0] === vehicle.yearModel && normalizeVehicleText(normalizeFuel(y.name.replace(/^\d{4}\s*/, ""))) === normalizeVehicleText(normalizeFuel(vehicle.fuel)));
          for (const y of fuels) candidates.push({ label: `${model.name} · ${y.name}`, parameters: { type, brandId: brand[0].code, modelId: model.code, yearId: y.code } });
        }
        if (controller.signal.aborted || current.current !== identity) return;
        if (candidates.length === 1) {
          const d = await query<FipeDetail>("detail", candidates[0].parameters);
          if (normalizeVehicleText(normalizeFuel(d.fuel)) !== normalizeVehicleText(normalizeFuel(vehicle.fuel))) { setStatus("not_found"); return; }
          if (!controller.signal.aborted && current.current === identity) { setDetail(d); setStatus("matched"); callback.current(d, candidates[0].parameters, identity); }
        } else if (candidates.length) { setChoices(candidates); setStatus("multiple"); }
        else setStatus("not_found");
      } catch (e) { if (!controller.signal.aborted && current.current === identity) { setStatus("error"); setError((e as Error).message); } }
    }, 800);
    return () => { window.clearTimeout(timer); controller.abort(); selecting.current?.abort(); };
  }, [identity, existing, vehicle.vehicleType, vehicle.brand, vehicle.model, vehicle.yearModel, vehicle.fuel]);
  const choose = async (index: string) => {
    const c = choices[Number(index)]; if (!c || index === "") return;
    selecting.current?.abort(); const controller = new AbortController(); selecting.current = controller;
    setStatus("searching");
    try { const { data } = await fipeApi<{ data: FipeDetail }>("query", { operation: "detail", parameters: c.parameters }, controller.signal); if (!controller.signal.aborted && current.current === identity) { setDetail(data); setStatus("matched"); callback.current(data, c.parameters, identity); } }
    catch (e) { if (!controller.signal.aborted) { setStatus("error"); setError((e as Error).message); } }
  };
  return <div data-tour="vehicles-form-fipe" className="grid gap-2 rounded-xl border border-line p-4 sm:col-span-2" aria-live="polite">
    <p className="text-sm font-semibold">Referência FIPE</p>
    {status === "waiting" && <p className="text-xs text-muted">Informe fabricante, modelo, ano modelo e combustível para consultar automaticamente.</p>}
    {status === "searching" && <p className="text-xs text-muted">Consultando referência FIPE… O cadastro continua disponível.</p>}
    {status === "multiple" && <Select aria-label="Encontramos mais de uma versão FIPE" value="" placeholder="Encontramos mais de uma versão — selecione" options={choices.map((c,i) => ({ value: String(i), label: c.label }))} onChange={e => void choose(e.target.value)} />}
    {detail && <><p className="font-semibold">{formatCurrency(detail.price)} <span className="text-xs text-muted">{detail.referenceLabel}</span></p><p className="text-xs text-muted">{detail.model} · código {detail.code}</p></>}
    {status === "matched" && !detail && existing && <p className="text-xs text-muted">Referência persistida preservada. Nova consulta só após alterar a identificação.</p>}
    {status === "not_found" && <p className="text-xs text-muted">Não encontramos automaticamente uma referência FIPE para esta combinação. Você pode continuar cadastrando normalmente; refine o modelo se houver muitas versões.</p>}
    {status === "error" && <p className="text-xs text-amber-300">Não foi possível consultar a FIPE agora. Você pode continuar normalmente. {error}</p>}
  </div>;
}
