"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { variation, type FipeLink } from "@/lib/fipe";
import { formatCurrency } from "@/lib/utils";
import { FipePicker, fipeApi } from "./fipe-picker";
interface History { id: string; fipe_code: string; year_id: string; price: number; reference_month: string; reference_label: string }
interface Snapshot { fipe: FipeLink | null; fipe_price: number | null; fipe_reference_month: string | null; fipe_checked_at: string | null; purchase_value: number | null }
export function VehicleFipePanel({ vehicleId, onChanged }: { vehicleId: string; onChanged?: () => void }) {
 const [v, setV] = useState<Snapshot | null>(null), [history, setHistory] = useState<History[]>([]), [busy, setBusy] = useState(false), [picker, setPicker] = useState(false), [unlink, setUnlink] = useState(false), [error, setError] = useState<string | null>(null);
 const load = useCallback(async () => { const r = await fetch(`/api/fipe/vehicles?vehicleId=${encodeURIComponent(vehicleId)}`, { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setV(j.vehicle); setHistory(j.history); }, [vehicleId]);
 useEffect(() => { let alive = true; fetch(`/api/fipe/vehicles?vehicleId=${encodeURIComponent(vehicleId)}`, { cache: "no-store" }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }).then(j => { if(alive) { setV(j.vehicle); setHistory(j.history); } }).catch(e => alive && setError(e.message)); return () => { alive = false; }; }, [vehicleId]);
 const run = async (action: string, parameters?: unknown) => { setBusy(true); try { await fipeApi("vehicles", { action, vehicleId, parameters }); await load(); onChanged?.(); setPicker(false); toast.success(action === "unlink" ? "FIPE desvinculada. Histórico preservado." : "FIPE atualizada."); } catch(e) { toast.error((e as Error).message); } finally { setBusy(false); } };
 const series = history.filter(h => h.fipe_code === v?.fipe?.code && h.year_id === v?.fipe?.yearId);
 const diff = variation(v?.fipe_price ?? 0, v?.purchase_value), change = variation(v?.fipe_price ?? 0, series.at(-2)?.price);
 return <Card className="grid gap-3 p-4"><h3 className="font-semibold">Tabela FIPE</h3>
  {error && <p className="text-xs text-muted">{error} O cadastro manual não é afetado.</p>}
  {v?.fipe ? <>
   <p className="text-sm">{v.fipe.version} · {v.fipe.modelYear === 32000 ? "Zero KM" : v.fipe.modelYear} · {v.fipe.fuel}</p><p className="text-xs text-muted">Código {v.fipe.code} · referência {v.fipe_reference_month} · consultado {v.fipe_checked_at ? new Date(v.fipe_checked_at).toLocaleString("pt-BR") : "—"}</p>
   <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-muted">Valor de compra</p><p className="font-semibold">{formatCurrency(v.purchase_value ?? undefined)}</p></div><div><p className="text-xs text-muted">FIPE atual</p><p className="font-semibold">{formatCurrency(v.fipe_price ?? undefined)}</p></div></div>
   {diff && <p className="text-xs">Comparação com compra: {formatCurrency(diff.amount)} ({diff.percent.toFixed(2)}%). Não representa lucro.</p>}
   <p className="text-xs text-muted">{change ? `Variação na mesma versão: ${formatCurrency(change.amount)} (${change.percent.toFixed(2)}%).` : "Histórico insuficiente para calcular variação."}</p>
   {series.length > 0 && <><div className="h-44 w-full min-w-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={series}><XAxis dataKey="reference_month" tick={{ fill: "var(--color-muted)", fontSize: 10 }} /><YAxis width={65} tick={{ fill: "var(--color-muted)", fontSize: 10 }} /><Tooltip formatter={value => formatCurrency(Number(value))} contentStyle={{ background: "var(--color-panel)", color: "var(--color-text)" }} /><Line dataKey="price" stroke="var(--color-magenta)" name="FIPE" /></LineChart></ResponsiveContainer></div><ul className="grid gap-1 text-xs">{series.map(h => <li key={h.id}>{h.reference_label} · {formatCurrency(h.price)}</li>)}</ul></>}
   <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => run("update")}>Atualizar FIPE</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => run("history")}>Consultar histórico oficial</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setPicker(!picker)}>Alterar versão</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => setUnlink(true)}>Desvincular FIPE</Button></div>
  </> : <><p className="text-sm text-muted">Veículo sem vínculo FIPE.</p><Button variant="outline" size="sm" onClick={() => setPicker(!picker)}>Buscar na FIPE</Button>{history.length > 0 && <p className="text-xs text-muted">{history.length} leituras anteriores preservadas no histórico.</p>}</>}
  {picker && <FipePicker initialType={v?.fipe?.type ?? "cars"} onUse={(_detail, p) => run("link", p)} />}
  <ConfirmDialog open={unlink} onOpenChange={setUnlink} title="Desvincular FIPE?" description="O preço atual será removido. Leituras históricas permanecerão registradas." confirmLabel="Desvincular" onConfirm={() => run("unlink")} />
 </Card>;
}
