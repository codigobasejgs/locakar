"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mapTrackedVehicle, type TrackedVehicle } from "@/lib/selsyn";
import { VehicleLockControl } from "@/components/admin/vehicle-lock-control";

export async function selsynPost<T>(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/selsyn/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, requestId: crypto.randomUUID() }), signal, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${json.error ?? "Não foi possível consultar a Selsyn."} [${json.code ?? `HTTP ${res.status}`}]`);
  return json as T;
}
const time = (s?: string) => s && Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString("pt-BR") : "Não informado";

export function TrackingDetails({ tracked, localOdometer }: { tracked: TrackedVehicle; localOdometer?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="grid min-w-0 gap-3 text-sm">
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {([
        ["Rastreável", tracked.id], ["Identificador", tracked.identifier], ["Status", tracked.status ?? "Não informado"],
        ["Comunicação", time(tracked.communicatedAt)], ["Posição em", time(tracked.position?.time)],
        ["Velocidade", tracked.position?.speed !== undefined ? `${tracked.position.speed} km/h` : "Não informado"],
        ["Ignição", tracked.position?.ignition === undefined ? "Não informado" : tracked.position.ignition ? "Ligada" : "Desligada"],
        ["Coordenadas", tracked.position ? `${tracked.position.latitude}, ${tracked.position.longitude}` : "Não informado"],
        ["Bateria", tracked.battery !== undefined ? `${tracked.battery} ${tracked.batteryUnit ?? "(unidade não informada)"}` : "Não informado"],
        ["Fonte de energia", tracked.power !== undefined ? `${tracked.power} ${tracked.powerUnit ?? "(unidade não informada)"}` : "Não informado"],
        ["Endereço retornado", tracked.address ?? "Não informado"], ["Contador de distância Selsyn", tracked.distanceCounter !== undefined ? `${tracked.distanceCounter.toLocaleString("pt-BR")} (unidade não documentada) — sem atualização automática` : "Não informado"],
        ["GPS: satélites", tracked.satellites ?? "Não informado"], ["Dispositivo", tracked.deviceId ?? "Não informado"],
        ["Hodômetro LOCAKAR", localOdometer !== undefined ? `${localOdometer.toLocaleString("pt-BR")} km` : "Não informado"],
      ] as [string, string | number][]).map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="break-words font-medium">{v}</dd></div>)}
    </dl>
    {tracked.position?.time && Number.isFinite(Date.parse(tracked.position.time)) && now - Date.parse(tracked.position.time) > 300_000 && <p className="text-xs text-amber-300">Última posição recebida há {Math.floor((now - Date.parse(tracked.position.time)) / 60_000)} minutos; não é posição ao vivo.</p>}
    {tracked.sensors.length > 0 && <div className="grid gap-2"><p className="text-xs font-semibold text-muted">Sensores retornados</p>{tracked.sensors.map((s, i) => <p key={i}>{s.description ?? `Sensor ${s.id ?? i + 1}`}: {s.value ?? "Não informado"} {s.unit ?? ""}</p>)}</div>}
  </div>;
}

export function VehicleTrackingPanel({ vehicle }: { vehicle: { id: string; plate?: string; selsynRastreavelId?: string; odometer?: number } }) {
  const [data, setData] = useState<TrackedVehicle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    if (busy || !vehicle.selsynRastreavelId) return;
    setBusy(true); setError(null);
    try {
      const r = await selsynPost<{ data: unknown }>("query/aovivoPorRastreavel", { parameters: { rastreavelId: vehicle.selsynRastreavelId } });
      setData(mapTrackedVehicle(r.data));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Card className="grid gap-4 p-4"><h3 className="font-semibold">Rastreamento</h3>
    {!vehicle.selsynRastreavelId ? <p className="text-sm text-muted">Este veículo ainda não possui rastreador vinculado.</p> : <><p className="text-xs text-muted">Selsyn #{vehicle.selsynRastreavelId}</p>{data && <TrackingDetails tracked={data} localOdometer={vehicle.odometer} />}{data && vehicle.plate && <VehicleLockControl vehicleId={vehicle.id} plate={vehicle.plate} locked={data.locked} lockEnabled={data.lockEnabled} onDone={refresh} />}<Button variant="outline" disabled={busy} onClick={refresh}>{busy ? "Consultando…" : "Atualizar posição"}</Button></>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <Link className="text-sm text-brand-soft hover:underline" href={`/admin/monitoring?vehicle=${encodeURIComponent(vehicle.id)}`}>Abrir central de rastreamento</Link>
  </Card>;
}
