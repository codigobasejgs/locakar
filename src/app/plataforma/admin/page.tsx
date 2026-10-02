"use client";

import { Building2, PauseCircle, PlayCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PLATFORM } from "@/lib/platform";
import type { OrgStatus } from "@/types";

interface OrgItem {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  status: OrgStatus;
  created_at: string;
  vehiclesCount: number;
  usersCount: number;
  subscriptions?: { plan_id: string; trial_ends_at: string | null } | null;
}

interface PlanItem {
  id: string;
  name: string;
}

export default function SuperAdminPage() {
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/platform/admin")
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Acesso restrito.");
        }
        return r.json();
      })
      .then((d) => {
        setOrgs(d.organizations || []);
        setPlans(d.plans || []);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const changeStatus = async (organizationId: string, status: OrgStatus) => {
    try {
      const res = await fetch("/api/platform/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", organizationId, status }),
      });
      if (!res.ok) throw new Error("Não foi possível alterar o status.");
      toast.success("Status atualizado.");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const changePlan = async (organizationId: string, planId: string) => {
    try {
      const res = await fetch("/api/platform/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan", organizationId, planId }),
      });
      if (!res.ok) throw new Error("Não foi possível alterar o plano.");
      toast.success("Plano atualizado.");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const statusTone: Record<OrgStatus, "success" | "warning" | "danger" | "neutral"> = {
    active: "success",
    trial: "warning",
    past_due: "warning",
    suspended: "danger",
    cancelled: "neutral",
  };

  const statusLabel: Record<OrgStatus, string> = {
    active: "Ativa",
    trial: "Teste grátis",
    past_due: "Atraso",
    suspended: "Suspensa",
    cancelled: "Cancelada",
  };

  return (
    <main className="min-h-dvh bg-ink px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
              <ShieldCheck className="size-4" /> Super Admin da plataforma
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold">{PLATFORM.name}</h1>
            <p className="mt-1 text-xs text-muted">Gestão central de locadoras, planos e limites.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin">Abrir meu painel</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/plataforma">Ver landing</Link>
            </Button>
          </div>
        </header>

        {error ? (
          <div className="mt-12 rounded-2xl border border-red-500/25 bg-red-500/10 p-8 text-center text-red-200">
            <p className="font-semibold">{error}</p>
            <p className="mt-2 text-xs text-zinc-400">Seu usuário não está na tabela de administradores da plataforma.</p>
          </div>
        ) : loading ? (
          <div className="mt-8 h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
        ) : (
          <section className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">
                Locadoras cadastradas ({orgs.length})
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line bg-panel text-muted">
                    <th className="p-3 font-semibold">Locadora</th>
                    <th className="p-3 font-semibold">Endereço (slug)</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold">Plano</th>
                    <th className="p-3 font-semibold text-right">Veículos</th>
                    <th className="p-3 font-semibold text-right">Usuários</th>
                    <th className="p-3 font-semibold text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {orgs.map((o) => (
                    <tr key={o.id} className="hover:bg-white/[0.02]">
                      <td className="p-3">
                        <p className="font-semibold text-white flex items-center gap-1.5">
                          <Building2 className="size-3.5 text-muted shrink-0" /> {o.name}
                        </p>
                        <p className="text-[11px] text-muted">{o.email || o.phone || "Sem contato"}</p>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-zinc-300">{o.slug}</td>
                      <td className="p-3">
                        <Badge tone={statusTone[o.status]}>{statusLabel[o.status] ?? o.status}</Badge>
                      </td>
                      <td className="p-3">
                        <select
                          value={o.subscriptions?.plan_id || "completo"}
                          onChange={(e) => changePlan(o.id, e.target.value)}
                          className="rounded-lg border border-line bg-panel px-2 py-1 text-xs text-white outline-none"
                        >
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 text-right font-semibold text-white">{o.vehiclesCount}</td>
                      <td className="p-3 text-right font-semibold text-white">{o.usersCount}</td>
                      <td className="p-3 text-right">
                        {o.status === "suspended" ? (
                          <Button size="sm" variant="ghost" onClick={() => changeStatus(o.id, "active")}>
                            <PlayCircle className="size-3.5 text-emerald-400" /> Reativar
                          </Button>
                        ) : (
                          <Button size="sm" variant="danger" onClick={() => changeStatus(o.id, "suspended")}>
                            <PauseCircle className="size-3.5" /> Suspender
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
