"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function SelsynSettings() {
  const [status, setStatus] = useState<{ configured: boolean; databaseReady: boolean; refreshSeconds: number; lastRequest?: { operation_id: string; status: string; error_code?: string; created_at: string } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ operation: string; label: string; group: string; ok: boolean; code: string }[] | null>(null);
  const [probing, setProbing] = useState(false);
  const diagnose = async () => {
    if (probing) return;
    setProbing(true); setError(null);
    try {
      const r = await fetch("/api/selsyn/diagnostic", { method: "POST", cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${j.error ?? "Falha no diagnóstico."} [${j.code ?? r.status}]`);
      setProbe(j.results);
    } catch (e) { setError((e as Error).message); }
    finally { setProbing(false); }
  };
  useEffect(() => {
    let alive = true;
    fetch("/api/selsyn/status", { cache: "no-store" }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }).then(j => alive && setStatus(j)).catch(() => alive && setError("Não foi possível verificar a configuração."));
    return () => { alive = false; };
  }, []);
  return <div className="grid gap-3 sm:col-span-2">
    <p className="font-semibold">{!status ? "Verificando…" : status.configured && status.databaseReady ? "Configurada (consulta real ainda depende da permissão do fornecedor)" : "Configuração incompleta"}</p>
    <p className="text-sm text-muted">A chave é configurada exclusivamente como SELSYN_API_KEY no ambiente do backend. Não cole a credencial neste painel. Sem comandos de bloqueio ou acionamento.</p>
    {status && <p className="text-xs text-muted">Credencial no servidor: {status.configured ? "presente" : "ausente"} · Banco: {status.databaseReady ? "preparado" : "migration pendente"} · Atualização opcional: {status.refreshSeconds}s</p>}
    {status?.lastRequest && <p className="text-xs text-muted">Última consulta: {new Date(status.lastRequest.created_at).toLocaleString("pt-BR")} · {status.lastRequest.operation_id} · {status.lastRequest.status}{status.lastRequest.error_code ? ` (${status.lastRequest.error_code})` : ""}</p>}
    <button type="button" onClick={diagnose} disabled={probing || !status?.configured} className="justify-self-start rounded-lg border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-50">{probing ? "Verificando permissões…" : "Verificar permissões da chave (4 consultas)"}</button>
    {probe && <ul className="grid gap-1 text-xs">{probe.map(p => <li key={p.operation}><span className={p.ok ? "text-emerald-400" : "text-red-400"}>{p.ok ? "Permitido" : p.code}</span> · {p.label} <span className="text-muted">({p.group})</span></li>)}</ul>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <Link href="/admin/monitoring" className="text-sm font-semibold text-brand-soft hover:underline">Abrir Rastreamento</Link>
  </div>;
}
