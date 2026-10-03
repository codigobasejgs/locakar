"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { SearchChoice } from "@/components/ui/search-choice";
import { FIPE_TYPES, type FipeDetail, type FipeInput, type FipeOption, type FipeOperation, type FipeType } from "@/lib/fipe";
import { formatCurrency } from "@/lib/utils";
export async function fipeApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
 const r = await fetch(`/api/fipe/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
 const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Falha na consulta FIPE."); return j;
}
export function FipePicker({ initialType = "cars", onUse }: { initialType?: FipeType; onUse: (detail: FipeDetail, parameters: FipeInput) => void }) {
 const [type, setType] = useState(initialType), [brands, setBrands] = useState<FipeOption[]>([]), [models, setModels] = useState<FipeOption[]>([]), [years, setYears] = useState<FipeOption[]>([]);
 const [brand, setBrand] = useState(""), [model, setModel] = useState(""), [year, setYear] = useState("");
 const [detail, setDetail] = useState<FipeDetail | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
 const [byYear, setByYear] = useState(false);
 const pending = useRef(false);
 const run = async (op: FipeOperation, p: FipeInput, apply: (data: FipeOption[] | FipeDetail) => void) => {
  if (pending.current) return; pending.current = true; setBusy(true); setError(null);
  try { const r = await fipeApi<{ data: FipeOption[] | FipeDetail }>("query", { operation: op, parameters: p }); apply(r.data); }
  catch(e) { setError((e as Error).message); } finally { pending.current = false; setBusy(false); }
 };
 return <div className="grid min-w-0 gap-3 rounded-xl border border-line p-4 sm:col-span-2">
  <p className="text-sm font-semibold">Buscar na Tabela FIPE</p><p className="text-xs text-muted">Selecione a versão exata. FIPE não identifica placa, chassi ou Renavam. Preenchimento manual permanece disponível.</p>
  <Select aria-label="Tipo FIPE" disabled={busy} value={type} onChange={e => { setType(e.target.value as FipeType); setBrands([]); setModels([]); setYears([]); setBrand(""); setModel(""); setYear(""); setDetail(null); }} options={Object.entries(FIPE_TYPES).map(([value,v]) => ({ value, label: v.label }))} />
  <label className="text-xs"><input type="checkbox" checked={byYear} disabled={busy} onChange={e => { setByYear(e.target.checked); setModels([]); setYears([]); setBrand(""); setModel(""); setYear(""); setDetail(null); }} /> Selecionar ano antes da versão</label>
  <Button variant="outline" disabled={busy} onClick={() => run("brands", { type }, d => setBrands(d as FipeOption[]))}>{busy ? "Consultando…" : "Consultar marcas"}</Button>
  {brands.length > 0 && <SearchChoice label="Marca" disabled={busy} options={brands} value={brand} onChange={b => { setBrand(b); setModel(""); setYear(""); setDetail(null); setModels([]); setYears([]); run(byYear ? "brandYears" : "models", { type, brandId: b }, d => byYear ? setYears(d as FipeOption[]) : setModels(d as FipeOption[])); }} />}
  {models.length > 0 && <SearchChoice label="Modelo / versão FIPE" disabled={busy} options={models} value={model} onChange={m => { setModel(m); setDetail(null); if(byYear) run("detail", { type, brandId: brand, modelId: m, yearId: year }, d => setDetail(d as FipeDetail)); else { setYear(""); setYears([]); run("years", { type, brandId: brand, modelId: m }, d => setYears(d as FipeOption[])); } }} />}
  {years.length > 0 && <SearchChoice label="Ano modelo / combustível" disabled={busy} options={years.map(y => ({ ...y, name: y.name.replace("32000", "Zero KM") }))} value={year} onChange={y => { setYear(y); setDetail(null); if(byYear) { setModel(""); setModels([]); run("yearModels", { type, brandId: brand, yearId: y }, d => setModels(d as FipeOption[])); } else run("detail", { type, brandId: brand, modelId: model, yearId: y }, d => setDetail(d as FipeDetail)); }} />}
  {error && <p role="alert" className="text-sm text-red-400">{error} Você pode preencher manualmente.</p>}
  {detail && <div className="grid gap-2 rounded-lg border border-magenta/40 bg-magenta/5 p-3"><p className="font-semibold">{detail.brand} · {detail.model}</p><p className="text-xs">{detail.modelYear === 32000 ? "Zero KM" : detail.modelYear} · {detail.fuel} · Código FIPE {detail.code}</p><p className="font-display text-lg font-bold">{formatCurrency(detail.price)} <span className="text-xs font-normal text-muted">{detail.referenceLabel}</span></p><Button disabled={busy} onClick={() => onUse(detail, { type, brandId: brand, modelId: model, yearId: year })}>Usar estes dados</Button></div>}
 </div>;
}
