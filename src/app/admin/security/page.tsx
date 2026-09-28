"use client";

import { ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/page-header";
import { tenantAdminGet, when } from "@/components/admin/tenant-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, EmptyState, StatCard } from "@/components/ui/card";
import { RISK_LEVEL, type RiskLevel } from "@/lib/antifraud";

interface RiskClient {
  clientId: string;
  clientName: string;
  score: number;
  level: RiskLevel;
  factors: string[];
  lastSeen: string;
  ips: string[];
  devices: string[];
  integrity: string | null;
  emulator: boolean;
  history: { at: string; score: number; ip: string | null }[];
  consent: { version: string; scopes: string[]; at: string } | null;
}

interface Security {
  clients: RiskClient[];
  devices: { clientName: string; installationId: string; platform: string; model: string | null; os: string | null; appVersion: string | null; active: boolean; push: boolean; lastSeen: string }[];
  audit: { id: number; actor: string; action: string; entity: string; ip: string | null; at: string }[];
}

const ACTION_LABEL: Record<string, string> = {
  "payment_receipt.submitted": "Enviou comprovante",
  "inspection.submitted": "Enviou vistoria",
  "incident.created": "Relatou ocorrência",
  "document.submitted": "Enviou documento",
  "reservation.requested": "Pediu reserva",
  "reservation.cancelled": "Cancelou reserva",
  "consent.accepted": "Aceitou a política de privacidade",
  "incident.status": "Atualizou ocorrência",
  "document.review": "Conferiu documento",
  "inspection.review": "Conferiu vistoria",
};

/**
 * Central de Segurança do App do Locatário. Score e sinais só para a equipe.
 * Serve para priorizar a conferência humana: nenhum cliente é bloqueado automaticamente.
 */
export default function SecurityPage() {
  const [data, setData] = useState<Security | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    tenantAdminGet<Security>("view=security").then((r) => {
      if (!alive) return;
      if (r) setData(r);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const attention = data?.clients.filter((c) => c.score >= 30).length ?? 0;
  const critical = data?.clients.filter((c) => c.score >= 80).length ?? 0;

  return (
    <>
      <PageHeader
        title="Segurança"
        description="Sinais do app do locatário nos últimos 30 dias. O score orienta a conferência: nenhum cliente é bloqueado automaticamente."
      />

      {failed && (
        <Card className="mb-6 p-5 text-sm text-muted">Não foi possível carregar. Confirme que a migração 20261002000000_locatario_fases_3_7.sql foi executada no Supabase.</Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Clientes monitorados" value={data?.clients.length ?? "—"} icon={ShieldCheck} />
        <StatCard label="Atenção ou mais" value={attention} icon={ShieldAlert} accent={attention > 0} />
        <StatCard label="Críticos" value={critical} icon={ShieldAlert} accent={critical > 0} />
        <StatCard label="Aparelhos ativos" value={data?.devices.filter((d) => d.active).length ?? "—"} icon={Smartphone} />
      </div>

      <Card className="mb-6">
        <CardHeader title="Clientes por risco" description="0–29 baixo · 30–59 atenção · 60–79 elevado · 80–100 crítico. Toque para ver as evidências." />
        {!data ? (
          <EmptyState title="Carregando..." />
        ) : !data.clients.length ? (
          <EmptyState title="Sem leituras ainda" description="Aparecem quando os clientes abrem o app e aceitam a política de privacidade." />
        ) : (
          <ul className="divide-y divide-line px-5 pb-2 pt-3">
            {data.clients.map((c) => (
              <li key={c.clientId} className="py-3">
                <button className="flex w-full flex-wrap items-center justify-between gap-3 text-left" onClick={() => setOpen(open === c.clientId ? null : c.clientId)} aria-expanded={open === c.clientId}>
                  <div className="min-w-0">
                    <p className="font-medium text-white">{c.clientName}</p>
                    <p className="text-xs text-muted">
                      {c.factors.length ? c.factors.join(" · ") : "Sem sinais de risco"} · última leitura {when(c.lastSeen)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-semibold tabular-nums">{c.score}</span>
                    <Badge tone={RISK_LEVEL[c.level].tone}>{RISK_LEVEL[c.level].label}</Badge>
                  </div>
                </button>
                {open === c.clientId && (
                  <dl className="mt-3 grid gap-3 rounded-xl border border-line p-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase text-muted">Aparelhos</dt>
                      <dd>{c.devices.join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">IPs (30 dias)</dt>
                      <dd className="break-all tabular-nums">{c.ips.join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Integridade do app</dt>
                      <dd>{c.integrity ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Emulador</dt>
                      <dd>{c.emulator ? "Sim" : "Não"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Consentimento</dt>
                      <dd>{c.consent ? `Versão ${c.consent.version} · ${when(c.consent.at)} · ${c.consent.scopes.join(", ")}` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase text-muted">Histórico do score</dt>
                      <dd className="tabular-nums">{c.history.map((h) => `${h.score} (${new Date(h.at).toLocaleDateString("pt-BR")})`).join(" · ")}</dd>
                    </div>
                  </dl>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Aparelhos" description="Registrados pelo app. Push = recebe notificações no celular." />
          <div className="overflow-x-auto px-5 pb-5 pt-3">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Aparelho</th>
                  <th className="py-2 pr-3">App</th>
                  <th className="py-2 pr-3">Push</th>
                  <th className="py-2">Visto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data?.devices.map((d) => (
                  <tr key={`${d.clientName}-${d.installationId}`} className={d.active ? "" : "opacity-50"}>
                    <td className="py-2 pr-3">{d.clientName}</td>
                    <td className="py-2 pr-3">{[d.model, d.platform, d.os].filter(Boolean).join(" · ")}</td>
                    <td className="py-2 pr-3 tabular-nums">{d.appVersion ?? "—"}</td>
                    <td className="py-2 pr-3">{d.push ? "Sim" : "Não"}</td>
                    <td className="py-2 whitespace-nowrap">{when(d.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && !data.devices.length && <p className="py-6 text-center text-sm text-muted">Nenhum aparelho registrado.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Auditoria" description="Últimas ações feitas pelo app e pela equipe, com IP." />
          <ul className="divide-y divide-line px-5 pb-3 pt-2 text-sm">
            {data?.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <span className="font-medium text-white">{a.actor}</span> · {ACTION_LABEL[a.action] ?? a.action}
                </span>
                <span className="text-xs text-muted tabular-nums">
                  {when(a.at)}
                  {a.ip ? ` · ${a.ip}` : ""}
                </span>
              </li>
            ))}
            {data && !data.audit.length && <li className="py-6 text-center text-muted">Nada registrado ainda.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
