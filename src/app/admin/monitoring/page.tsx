"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CarFront, Link2, Radio, RefreshCw, Route, Satellite, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/admin/page-header";
import { SelsynResult } from "@/components/admin/selsyn-result";
import { selsynPost, TrackingDetails } from "@/components/admin/vehicle-tracking-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, StatCard } from "@/components/ui/card";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { localDateToUtc, record, SELSYN_OPERATIONS, trackingPoint, trackingTotals, type Json, type TrackedVehicle } from "@/lib/selsyn";

const TrackingMap = dynamic(() => import("@/components/admin/tracking-map").then(m => m.TrackingMap), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-xl bg-surface" /> });
type Tab = "fleet" | "history" | "sensors" | "alerts" | "reports" | "links";
interface LocalVehicle { id: string; name: string; plate: string; image: string; odometer?: number; selsyn_rastreavel_id?: string; selsyn_identificador?: string }
interface FleetResult { fleet: TrackedVehicle[]; vehicles: LocalVehicle[]; suggestions: { rastreavelId: string; vehicleId: string | null }[]; queriedAt: string }
interface Status { configured: boolean; databaseReady: boolean; refreshSeconds: number; lastRequest?: { operation_id: string; status: string; error_code?: string; created_at: string } | null }
interface Result { data: Json; queriedAt: string; requestId: string; file?: { name: string; mime: string; base64: string } }
const TABS: [Tab, string][] = [["fleet", "Frota e mapa"], ["history", "Histórico"], ["sensors", "Sensores"], ["alerts", "Alertas"], ["reports", "Relatórios"], ["links", "Vínculos"]];
const label: Record<string, string> = { dataInicial: "Data/hora inicial", dataFinal: "Data/hora final", format: "Formato", sensorId: "ID do sensor", rastreavelId: "ID do rastreável", idRastreavel: "ID do rastreável", identificador: "Identificador / placa", size: "Registros por página", page: "Página (começa em 0)", turnoInicial: "Turno: início", turnoFinal: "Turno: fim", turnoDoisInicial: "Segundo turno: início", turnoDoisFinal: "Segundo turno: fim", endereco: "Incluir endereço retornado", sumario: "Somente sumário", limiteVelocidade: "Limite de velocidade", tipoParada: "Tipo de parada", statusSensor: "Estado do sensor" };

export default function MonitoringPage() {
  const [tab, setTab] = useState<Tab>("fleet");
  const [status, setStatus] = useState<Status | null>(null);
  const [fleet, setFleet] = useState<FleetResult | null>(null);
  const [selected, setSelected] = useState("");
  const [operation, setOperation] = useState("relatorioHistoricoSensor");
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const pending = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const active = fleet?.fleet.find(v => v.id === selected);
  const ready = Boolean(status?.configured && status.databaseReady);
  const totals = useMemo(() => trackingTotals(fleet?.fleet ?? []), [fleet]);

  useEffect(() => {
    let alive = true;
    fetch("/api/selsyn/status", { cache: "no-store" }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j as Status; }).then(s => alive && setStatus(s)).catch(e => alive && setError(e.message));
    return () => { alive = false; abort.current?.abort(); };
  }, []);

  const synchronize = useCallback(async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    const controller = new AbortController(); abort.current = controller;
    try {
      const data = await selsynPost<FleetResult>("fleet", {}, controller.signal);
      setFleet(data);
      const requested = new URLSearchParams(window.location.search).get("vehicle");
      const linked = data.vehicles.find(v => v.id === requested)?.selsyn_rastreavel_id;
      setSelected(prev => data.fleet.some(v => v.id === prev) ? prev : linked && data.fleet.some(v => v.id === linked) ? linked : data.fleet[0]?.id ?? "");
    } catch (e) { if (!controller.signal.aborted) { setError((e as Error).message); setAuto(false); } }
    finally { if (!controller.signal.aborted) setBusy(false); pending.current = false; }
  }, []);

  useEffect(() => {
    if (!auto || !ready || tab !== "fleet") return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void synchronize(); }, (status?.refreshSeconds ?? 120) * 1000);
    return () => window.clearInterval(timer);
  }, [auto, ready, tab, synchronize, status?.refreshSeconds]);

  const setCurrentTab = (t: Tab) => {
    setTab(t); setResult(null); setValues({}); setError(null);
    setOperation(t === "history" ? "gdrListHistoricoPosicaoPorRastreavel" : t === "sensors" ? "relatorioHistoricoSensor" : t === "alerts" ? "listAlerta" : "relatorioSituacaoAtual");
  };
  const chooseOperation = (id: string) => { setOperation(id); setValues({}); setResult(null); };
  const operations = Object.entries(SELSYN_OPERATIONS).filter(([id]) => tab === "history" ? /HistoricoPosicao|HistoricoParada|HistoricoSatelital/.test(id) : tab === "sensors" ? /Sensor|Periferico/.test(id) : tab === "alerts" ? /Alerta|Alertas|Evento/.test(id) : true);
  const definition = SELSYN_OPERATIONS[operation];
  // sensorId path/query: um campo visual, o client envia ambas as posições oficiais.
  const fields = definition ? [...new Map(definition.parameters.map(p => [p.name, p])).values()] : [];

  const query = async () => {
    if (pending.current || !definition) return;
    pending.current = true; setBusy(true); setError(null); setResult(null);
    const controller = new AbortController(); abort.current = controller;
    try {
      const parameters: Record<string, unknown> = {};
      for (const p of fields) {
        const val = values[p.name] ?? (["rastreavelId", "idRastreavel"].includes(p.name) ? selected : p.name === "identificador" ? active?.identifier : p.default === undefined ? "" : String(p.default));
        if (!val) { if (p.required) throw new Error(`Informe ${label[p.name] ?? p.name}.`); continue; }
        parameters[p.name] = p.format?.includes("HH:mm:ss") ? localDateToUtc(val) : val;
      }
      setResult(await selsynPost<Result>(`query/${encodeURIComponent(operation)}`, { parameters }, controller.signal));
    } catch (e) { if (!controller.signal.aborted) setError((e as Error).message); }
    finally { if (!controller.signal.aborted) setBusy(false); pending.current = false; }
  };
  const link = async (r: TrackedVehicle, vehicle: LocalVehicle, unlink = false) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(null);
    try {
      await selsynPost("link", { vehicleId: vehicle.id, rastreavelId: r.id, identifier: r.identifier, unlink });
      setFleet(prev => prev ? { ...prev, vehicles: prev.vehicles.map(v => v.id === vehicle.id ? { ...v, selsyn_rastreavel_id: unlink ? undefined : r.id, selsyn_identificador: unlink ? undefined : r.identifier } : v) } : prev);
      toast.success(unlink ? "Vínculo removido." : "Rastreador vinculado.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); pending.current = false; }
  };
  const historyPositions = useMemo(() => {
    const r = record(result?.data); const positions = r.posicoes;
    return Array.isArray(positions) ? positions.flatMap((v, i) => { const p = trackingPoint(v, String(i), fleet?.fleet.find(v => v.id === selected)?.identifier ?? "Posição"); return p ? [p] : []; }) : [];
  }, [result, selected, fleet]);

  const download = () => {
    if (!result?.file) return;
    const bytes = Uint8Array.from(atob(result.file.base64), c => c.charCodeAt(0));
    // HTML baixado como texto: scripts externos nunca executam no contexto LOCAKAR.
    const html = result.file.mime === "text/html";
    const url = URL.createObjectURL(new Blob([bytes], { type: html ? "text/plain" : result.file.mime }));
    const a = document.createElement("a"); a.href = url; a.download = result.file.name + (html ? ".txt" : ""); a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div style={{ color: "var(--color-text)" }}>
    <PageHeader title="Monitoramento da frota" description="Rastreamento Selsyn: consultas administrativas, sem comandos sobre os veículos." actions={<Button disabled={!ready || busy} onClick={synchronize}><RefreshCw />{busy ? "Consultando…" : "Sincronizar Selsyn"}</Button>} />
    <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm">{!status ? "Verificando configuração…" : !status.configured ? "Não configurado: defina SELSYN_API_KEY no backend." : !status.databaseReady ? "Configuração incompleta: execute a migration Selsyn." : "Credencial configurada — acesso real será verificado ao consultar."}</p>{status?.lastRequest && <p className="text-xs text-muted">Última consulta: {status.lastRequest.operation_id} · {status.lastRequest.status}{status.lastRequest.error_code ? ` · ${status.lastRequest.error_code}` : ""}</p>}</Card>
    <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Rastreamento">{TABS.map(([id, title]) => <Button key={id} variant={tab === id ? "primary" : "outline"} size="sm" role="tab" aria-selected={tab === id} disabled={busy} onClick={() => setCurrentTab(id)}>{title}</Button>)}</div>
    {error && <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/5 p-4 text-sm text-red-400">{error}</p>}
    {busy && <div role="progressbar" aria-label="Consultando Selsyn" className="mb-4 h-1 animate-pulse rounded bg-magenta/40" />}
    {!fleet && ["fleet", "links"].includes(tab) ? <Card><EmptyState title="Nenhuma consulta realizada" description="Sincronize a frota para descobrir os rastreáveis disponíveis. A consulta utiliza a API real e pode consumir limites da sua conta." /></Card> : <>
      {tab === "fleet" && fleet && <>
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label="Rastreáveis retornados" value={totals.tracked} icon={CarFront} /><StatCard label="Em movimento" value={totals.moving} icon={Route} /><StatCard label="Parados" value={totals.stopped} icon={Radio} /><StatCard label="Offline (fornecedor)" value={totals.offline} icon={TriangleAlert} /><StatCard label="Sem velocidade" value={totals.unknown} icon={Satellite} /></div>
        <div className="mb-4 flex flex-wrap justify-between gap-2 text-xs text-muted"><p>Consultado em {new Date(fleet.queriedAt).toLocaleString("pt-BR")}. Posições podem estar desatualizadas.</p><Checkbox checked={auto} onChange={e => setAuto(e.target.checked)} label={`Atualizar posição a cada ${status?.refreshSeconds ?? 120}s (aba visível)`} /></div>
        <TrackingMap points={fleet.fleet.flatMap(v => v.position ? [v.position] : [])} />
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{fleet.fleet.map(v => {
          const l = fleet.vehicles.find(l => l.selsyn_rastreavel_id === v.id);
          return <Card key={v.id} className="grid gap-4 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold">{l?.name ?? v.description ?? v.identifier}</h3><p className="text-xs text-muted">{v.identifier} · Selsyn #{v.id}</p></div><Badge tone={v.offline ? "warning" : "neutral"}>{v.offline === undefined ? "Estado não informado" : v.offline ? "Offline" : "Online"}</Badge></div><TrackingDetails tracked={v} localOdometer={l?.odometer} /><Button size="sm" variant="outline" onClick={() => { setSelected(v.id); setCurrentTab("history"); }}>Histórico e relatórios</Button></Card>;
        })}</div>
        {!fleet.fleet.length && <p className="mt-4 text-sm text-muted">A Selsyn não retornou rastreáveis para esta credencial.</p>}
      </>}
      {tab === "links" && fleet && <Card className="grid gap-4 p-4"><h2 className="font-semibold">Vincular veículos existentes</h2><p className="text-sm text-muted">A placa deve corresponder nos dois sistemas. Vincular consulta novamente a Selsyn para validar o ID; nenhum veículo será criado automaticamente.</p>{fleet.fleet.map(r => {
        const suggestion = fleet.suggestions.find(s => s.rastreavelId === r.id);
        const v = fleet.vehicles.find(v => v.selsyn_rastreavel_id === r.id || v.id === suggestion?.vehicleId);
        return <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"><div className="min-w-0"><p className="font-medium">Selsyn: {r.identifier} · #{r.id}</p><p className="text-xs text-muted">LOCAKAR: {v ? `${v.name} — ${v.plate}` : "Nenhuma placa correspondente. Cadastre/corrija o veículo antes de vincular."}</p></div>{v && <Button size="sm" variant="outline" disabled={busy} onClick={() => link(r, v, v.selsyn_rastreavel_id === r.id)}><Link2 />{v.selsyn_rastreavel_id === r.id ? "Remover vínculo" : "Vincular"}</Button>}</div>;
      })}</Card>}
      {!["fleet", "links"].includes(tab) && <div className="grid gap-5">
        <Card className="grid gap-4 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Rastreável selecionado" htmlFor="tracking-selected"><Select id="tracking-selected" value={selected} onChange={e => { setSelected(e.target.value); setValues({}); setResult(null); }} options={(fleet?.fleet ?? []).map(v => ({ value: v.id, label: `${v.identifier} · #${v.id}` }))} /></Field><Field label="Consulta oficial" htmlFor="tracking-operation"><Select id="tracking-operation" value={operation} onChange={e => chooseOperation(e.target.value)} options={operations.map(([id, op]) => ({ value: id, label: op.label }))} /></Field></div>
          <p className="break-all text-xs text-muted">GET {definition?.path}</p>
          <p className="text-xs text-muted">Datas e horas no fuso do dispositivo ({Intl.DateTimeFormat().resolvedOptions().timeZone}); enviadas à Selsyn em UTC. Relatórios só por solicitação manual, sem repetição automática.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields.map(p => {
            const isTime = p.format?.includes("HH:mm:ss"); const isDate = p.format === "yyyy-MM-dd";
            const value = values[p.name] ?? (["idRastreavel", "rastreavelId"].includes(p.name) ? selected : p.name === "identificador" ? active?.identifier ?? "" : p.default === undefined ? "" : String(p.default));
            const options = p.type === "boolean" ? [{ value: "true", label: "Sim" }, { value: "false", label: "Não" }] : p.enum?.filter(v => v !== null).map(v => ({ value: String(v), label: String(v) }));
            return <Field key={p.name} label={label[p.name] ?? p.name} htmlFor={`tracking-${p.name}`} required={p.required} hint={p.description || undefined}>{options?.length ? <Select id={`tracking-${p.name}`} value={value} placeholder={p.required ? "Selecione" : "Padrão do fornecedor"} onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))} options={options} /> : <Input id={`tracking-${p.name}`} value={value} type={isTime ? "datetime-local" : isDate ? "date" : "text"} inputMode={p.type === "number" || p.type === "integer" ? "numeric" : undefined} required={p.required} onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))} />}</Field>;
          })}</div>
          <Button disabled={busy || !ready} onClick={query}>{busy ? "Consultando…" : "Consultar"}</Button>
        </Card>
        {result && <Card className="grid gap-4 p-4 sm:p-6"><h2 className="font-semibold">Resultado — Selsyn</h2><p className="break-all text-xs text-muted">{new Date(result.queriedAt).toLocaleString("pt-BR")} · Consulta {result.requestId}</p>{historyPositions.length > 0 && <TrackingMap points={historyPositions} route />}
          {definition?.response.$ref?.endsWith("/ReportResultDto") && <p className="rounded-lg border border-line p-3 text-xs text-muted">O fornecedor documenta o conteúdo deste relatório como objeto sem estrutura definida. Arquivos/links de exportação e estados assíncronos só serão interpretados após confirmação do formato real. A chave nunca será incluída em downloads.</p>}
          {result.file ? <Button variant="outline" onClick={download}>Baixar arquivo retornado pela Selsyn{result.file.mime === "text/html" ? " (HTML como texto seguro)" : ""}</Button> : <SelsynResult value={result.data} />}<details className="min-w-0"><summary className="cursor-pointer text-xs text-muted">Ver resposta técnica sanitizada</summary><pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-surface p-3 text-xs">{JSON.stringify(result.data, null, 2)}</pre></details>
        </Card>}
      </div>}
    </>}
  </div>;
}
