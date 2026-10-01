"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function SelsynSettings() {
  const [status, setStatus] = useState<{ configured: boolean; databaseReady: boolean; refreshSeconds: number; lastRequest?: { operation_id: string; status: string; error_code?: string; created_at: string } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <Link href="/admin/monitoring" className="text-sm font-semibold text-brand-soft hover:underline">Abrir Rastreamento</Link>
  </div>;
}
