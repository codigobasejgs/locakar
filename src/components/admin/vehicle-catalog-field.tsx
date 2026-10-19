"use client";
import { useEffect, useState } from "react";
import { Popover } from "radix-ui";
import { Input } from "@/components/ui/form";
import { fipeApi } from "./fipe-picker";
import { FIPE_TYPES, type FipeOption, type FipeType } from "@/lib/fipe";
import { normalizeVehicleText } from "@/lib/vehicle-input";

/** Catálogo contextual aberto sob demanda; entrada manual não depende da FIPE. */
export function VehicleCatalogField({ kind, type, brand, value, onChange, id }: { kind: "brand" | "model"; type: string; brand?: string; value: string; onChange: (v: string) => void; id: string }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState("");
  const [options, setOptions] = useState<FipeOption[]>([]), [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const t = Object.entries(FIPE_TYPES).find(([,v]) => v.label === type)?.[0] as FipeType | undefined;
    if (!t) return;
    const load = async () => {
      try {
        const { data: brands } = await fipeApi<{ data: FipeOption[] }>("query", { operation: "brands", parameters: { type: t } }, controller.signal);
        const found = brands.find(b => normalizeVehicleText(b.name) === normalizeVehicleText(brand ?? ""));
        const list = kind === "brand" ? brands : found ? (await fipeApi<{ data: FipeOption[] }>("query", { operation: "models", parameters: { type: t, brandId: found.code } }, controller.signal)).data : [];
        if (!controller.signal.aborted) { setOptions(list); setError(false); }
      } catch { if (!controller.signal.aborted) { setOptions([]); setError(true); } }
    };
    void load(); return () => controller.abort();
  }, [open, type, brand, kind]);
  const filtered = options.filter(o => normalizeVehicleText(o.name).includes(normalizeVehicleText(search)));
  return <div className="flex min-w-0 gap-1">
    <Input id={id} value={value} onChange={e => onChange(e.target.value)} required autoComplete="off" className="min-w-0" placeholder={kind === "brand" ? "Fabricante" : "Modelo"} />
    <Popover.Root open={open} onOpenChange={setOpen}><Popover.Trigger aria-label={`Selecionar ${kind === "brand" ? "fabricante" : "modelo"}`} className="rounded-xl border border-line px-3 text-muted">⌄</Popover.Trigger><Popover.Portal><Popover.Content sideOffset={6} align="end" className="z-[60] w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-line bg-panel p-3 shadow-xl">
      <Input aria-label="Pesquisar no catálogo" placeholder="Pesquisar…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="mt-2 max-h-56 overflow-y-auto">{filtered.map(o => <button key={o.code} type="button" className="block w-full rounded-lg p-2 text-left text-sm text-white hover:bg-surface focus-visible:outline-magenta" onClick={() => { onChange(o.name); setOpen(false); setSearch(""); }}>{o.name}</button>)}{!filtered.length && <p className="p-2 text-xs text-muted">{error ? "Catálogo indisponível; preencha manualmente." : "Nenhum resultado. A entrada manual continua disponível."}</p>}</div>
    </Popover.Content></Popover.Portal></Popover.Root>
  </div>;
}
