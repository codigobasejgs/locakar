"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { INTEGRATION_LABEL, type SelsynProbe, type SelsynIntegrationStatus, type CapabilityStatus } from "@/lib/selsyn-capabilities";

type Diagnosis = { results: SelsynProbe[]; status: SelsynIntegrationStatus; checkedAt: string; report: string; capabilities: { id: string; label: string; status: CapabilityStatus }[] };
const CAPABILITY_LABEL: Record<CapabilityStatus, string> = { AVAILABLE: "Disponível (operação testada)", FORBIDDEN: "Acesso recusado (403)", AUTH_ERROR: "Autenticação recusada (401)", UNAVAILABLE: "Não disponível nesta consulta", UNKNOWN: "Não testado" };
export function SelsynSettings() {
  const [status, setStatus] = useState<{ configured: boolean; tenantReady: boolean; databaseReady: boolean; refreshSeconds: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<Diagnosis | null>(null);
  const [probing, setProbing] = useState(false);
  const diagnose = async () => {
    if (probing) return;
    setProbing(true); setError(null);
    try {
      const r = await fetch("/api/selsyn/diagnostic", { method: "POST", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${j.error ?? "Falha no diagnóstico."} [${j.code ?? r.status}]`);
      setProbe(j);
    } catch (e) { setError((e as Error).message); }
    finally { setProbing(false); }
  };
  useEffect(() => {
    let alive = true;
    fetch("/api/selsyn/status", { cache: "no-store" }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }).then(j => alive && setStatus(j)).catch(() => alive && setError("Não foi possível verificar a configuração."));
    return () => { alive = false; };
  }, []);
  return <div className="grid gap-3 sm:col-span-2">
    <p className="font-semibold">{probe ? INTEGRATION_LABEL[probe.status] : !status ? "Verificando…" : status.configured ? INTEGRATION_LABEL.CONFIGURED : "Não configurada para esta locadora"}</p>
    <p className="text-sm text-muted">Credencial exclusivamente no servidor (SELSYN_API_KEY), vinculada à locadora por SELSYN_ORGANIZATION_ID. Comandos físicos desabilitados.</p>
    {status && <p className="text-xs text-muted">Credencial desta locadora: {status.configured ? "presente" : "ausente ou não vinculada"} · Banco: {status.databaseReady ? "tabelas e vínculos disponíveis" : "migration pendente"} · Atualização opcional: {status.refreshSeconds}s</p>}
    {status && !status.tenantReady && <p className="text-xs text-amber-300">Defina SELSYN_ORGANIZATION_ID no servidor com o ID da organização dona da chave. Acesso global bloqueado para proteger as demais locadoras.</p>}
    <p className="text-xs text-muted">Contrato: OpenAPI Selsyn 3.0.1 (Swagger 3.0.0) salvo em 06/10/2026 — operações e autenticação conferidas. Permissões dependem da Selsyn.</p>
    <button type="button" onClick={diagnose} disabled={probing || !status?.configured || !status.databaseReady} className="justify-self-start rounded-lg border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-50">{probing ? "Diagnosticando acesso…" : "Diagnosticar acesso Selsyn"}</button>
    {probe && <>
      <p className="text-xs text-muted">Diagnóstico em {new Date(probe.checkedAt).toLocaleString("pt-BR")}. Recursos não consultados permanecem desconhecidos.</p>
      <ul className="grid gap-2 text-sm">{probe.capabilities.map(p => <li key={p.id} className="flex flex-wrap justify-between gap-2"><span>{p.label}</span><span className={p.status === "AVAILABLE" ? "text-emerald-400" : p.status === "UNKNOWN" ? "text-muted" : "text-amber-300"}>{CAPABILITY_LABEL[p.status]}</span></li>)}</ul>
      <details className="text-xs"><summary className="cursor-pointer">Detalhes técnicos das operações</summary><ul className="mt-2 grid gap-2">{probe.results.map(p => <li key={p.operation}><strong>{p.operation}</strong> · {p.group} · HTTP {p.httpStatus ?? "não obtido"} · {p.code}{p.diagnostics && <span className="block break-all text-muted">GET {p.diagnostics.pathname} · {p.diagnostics.durationMs} ms · {p.diagnostics.contentType ?? "sem content-type"}</span>}{p.diagnostics?.providerBody !== undefined && <span className="block break-all">Resposta do fornecedor: <code>{JSON.stringify(p.diagnostics.providerBody).slice(0, 400)}</code></span>}</li>)}</ul></details>
      <button type="button" className="justify-self-start text-sm font-semibold text-brand-soft" onClick={async () => { try { await navigator.clipboard.writeText(probe.report); } catch { setError("Não foi possível copiar. Selecione o relatório abaixo."); } }}>Copiar relatório para suporte Selsyn</button>
      <details className="text-xs"><summary className="cursor-pointer">Relatório sem credencial</summary><pre className="mt-2 whitespace-pre-wrap break-words">{probe.report}</pre></details>
    </>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <Link href="/admin/monitoring" className="text-sm font-semibold text-brand-soft hover:underline">Abrir Rastreamento</Link>
  </div>;
}
