"use client";

import { Building2, History, LifeBuoy, Search, Settings2, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { ROLE_LABEL } from "@/lib/permissions";
import { PLATFORM } from "@/lib/platform";
import type { OrgRole, OrgStatus } from "@/types";

interface OrgItem {
  id: string;
  slug: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  status: OrgStatus;
  created_at: string;
  plan_id: string | null;
  trial_ends_at: string | null;
  owner_email: string | null;
  users: number;
  vehicles: number;
  clients: number;
  active_rentals: number;
  is_default: boolean;
}
interface Member { user_id: string; email: string; role: OrgRole; created_at: string }
interface Admin { user_id: string; email: string; created_at: string }
interface AuditItem { id: number; action: string; organization_id: string | null; details: Record<string, unknown>; created_at: string }
interface Data {
  me: string;
  organizations: OrgItem[];
  plans: { id: string; name: string }[];
  admins: Admin[];
  config: { trial_days: number; grace_days: number };
  audit: AuditItem[];
}

const STATUS: Record<OrgStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  active: { label: "Ativa", tone: "success" },
  trial: { label: "Teste grátis", tone: "warning" },
  past_due: { label: "Pagamento pendente", tone: "warning" },
  suspended: { label: "Suspensa", tone: "danger" },
  cancelled: { label: "Cancelada", tone: "neutral" },
};
const ACTION_LABEL: Record<string, string> = {
  status: "Status alterado", plan: "Plano alterado", extend_trial: "Teste prorrogado", update_org: "Dados editados",
  add_member: "Membro adicionado", member_role: "Função alterada", remove_member: "Membro removido",
  support_access: "Acesso de suporte", add_admin: "Super Admin adicionado", remove_admin: "Super Admin removido",
  config: "Configuração da plataforma", delete_org: "Locadora excluída",
};
const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/platform/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Não foi possível concluir.");
  return j;
}

export default function SuperAdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/platform/admin")
        .then(async (r) => {
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || "Acesso restrito.");
          setData(j);
          setError(null);
        })
        .catch((e: Error) => setError(e.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  /** Executa uma ação, avisa e recarrega a lista. */
  const run = useCallback(
    async (body: Record<string, unknown>, ok: string) => {
      try {
        const j = await post(body);
        toast.success(ok);
        if (j.redirect) window.location.assign(j.redirect);
        else await load();
        return true;
      } catch (e) {
        toast.error((e as Error).message);
        return false;
      }
    },
    [load],
  );

  const orgs = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.organizations ?? []).filter(
      (o) =>
        (!status || o.status === status) &&
        (!term || [o.name, o.slug, o.email, o.owner_email, o.document].some((v) => v?.toLowerCase().includes(term))),
    );
  }, [data, q, status]);

  const totals = useMemo(() => {
    const list = data?.organizations ?? [];
    const by = (s: OrgStatus) => list.filter((o) => o.status === s).length;
    return [
      { label: "Locadoras", value: list.length },
      { label: "Ativas", value: by("active") },
      { label: "Em teste", value: by("trial") },
      { label: "Pendentes/suspensas", value: by("past_due") + by("suspended") },
      { label: "Veículos na plataforma", value: list.reduce((n, o) => n + o.vehicles, 0) },
    ];
  }, [data]);

  const current = data?.organizations.find((o) => o.id === openId) ?? null;

  return (
    <main className="min-h-dvh bg-ink px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
              <ShieldCheck className="size-4" /> Super Admin da plataforma
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold">{PLATFORM.name}</h1>
            <p className="mt-1 text-xs text-muted">Todas as locadoras, planos, equipes e acessos.</p>
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
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-8 text-center text-red-200">
            <p className="font-semibold">{error}</p>
            <p className="mt-2 text-xs text-zinc-400">Seu usuário não está na tabela de administradores da plataforma.</p>
          </div>
        ) : !data ? (
          <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {totals.map((t) => (
                <div key={t.label} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-[11px] text-muted">{t.label}</p>
                  <p className="mt-1 font-display text-2xl font-bold tabular-nums">{t.value}</p>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-56 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, endereço, e-mail ou CNPJ" className="pl-9" aria-label="Buscar locadora" />
                </div>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  placeholder="Todos os status"
                  options={(Object.keys(STATUS) as OrgStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))}
                  className="w-48"
                  aria-label="Filtrar por status"
                />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-panel text-muted">
                      <th className="p-3 font-semibold">Locadora</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3 font-semibold">Plano / teste</th>
                      <th className="p-3 text-right font-semibold">Veículos</th>
                      <th className="p-3 text-right font-semibold">Clientes</th>
                      <th className="p-3 text-right font-semibold">Usuários</th>
                      <th className="p-3 font-semibold">Criada em</th>
                      <th className="p-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {orgs.map((o) => {
                      const left = o.status === "trial" ? daysLeft(o.trial_ends_at) : null;
                      return (
                        <tr key={o.id} className="hover:bg-white/[0.02]">
                          <td className="p-3">
                            <p className="flex items-center gap-1.5 font-semibold text-white">
                              <Building2 className="size-3.5 shrink-0 text-muted" /> {o.name}
                              {o.is_default && <Badge tone="info">principal</Badge>}
                            </p>
                            <p className="text-[11px] text-muted">
                              /{o.slug} · {o.owner_email || o.email || "sem dono"}
                            </p>
                          </td>
                          <td className="p-3">
                            <Badge tone={STATUS[o.status]?.tone ?? "neutral"}>{STATUS[o.status]?.label ?? o.status}</Badge>
                          </td>
                          <td className="p-3">
                            <p className="text-white">{data.plans.find((p) => p.id === o.plan_id)?.name ?? "—"}</p>
                            {left != null && <p className={left < 0 ? "text-red-300" : "text-muted"}>{left < 0 ? `venceu há ${-left} dia(s)` : `${left} dia(s) restantes`}</p>}
                          </td>
                          <td className="p-3 text-right tabular-nums">{o.vehicles}</td>
                          <td className="p-3 text-right tabular-nums">{o.clients}</td>
                          <td className="p-3 text-right tabular-nums">{o.users}</td>
                          <td className="p-3 text-muted">{fmtDate(o.created_at)}</td>
                          <td className="p-3 text-right">
                            <Button size="sm" variant="outline" onClick={() => setOpenId(o.id)}>
                              <Settings2 /> Gerenciar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {!orgs.length && (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-muted">
                          Nenhuma locadora encontrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <PlatformConfig config={data.config} run={run} />
              <Admins admins={data.admins} me={data.me} run={run} />
            </div>
            <AuditList audit={data.audit} orgs={data.organizations} />
          </>
        )}
      </div>

      {current && data && <OrgDialog key={current.id} org={current} plans={data.plans} run={run} onClose={() => setOpenId(null)} />}
      <Toaster theme="dark" position="bottom-right" richColors />
    </main>
  );
}

type Run = (body: Record<string, unknown>, ok: string) => Promise<boolean>;

function OrgDialog({ org, plans, run, onClose }: { org: OrgItem; plans: { id: string; name: string }[]; run: Run; onClose: () => void }) {
  const [form, setForm] = useState({
    name: org.name, slug: org.slug, legal_name: org.legal_name ?? "", document: org.document ?? "",
    email: org.email ?? "", phone: org.phone ?? "", whatsapp: org.whatsapp ?? "",
  });
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invite, setInvite] = useState({ email: "", role: "admin" });
  const [days, setDays] = useState("30");
  const [confirm, setConfirm] = useState("");
  const id = org.id;

  const loadMembers = useCallback(
    () =>
      fetch(`/api/platform/admin?org=${id}`)
        .then((r) => r.json())
        .then((j) => setMembers(j.members ?? [])),
    [id],
  );
  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const act = async (body: Record<string, unknown>, ok: string, reloadMembers = false) => {
    const done = await run({ organizationId: id, ...body }, ok);
    if (done && reloadMembers) await loadMembers();
    return done;
  };
  const bind = (k: keyof typeof form) => ({ id: `org-${k}`, value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={org.name} description={`/${org.slug} · criada em ${fmtDate(org.created_at)}`} size="lg">
      <div className="space-y-8">
        <Section title="Status e plano">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Status" htmlFor="org-status" className="w-48">
              <Select id="org-status" value={org.status} onChange={(e) => act({ action: "status", status: e.target.value }, "Status atualizado.")}
                options={(Object.keys(STATUS) as OrgStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))} />
            </Field>
            <Field label="Plano" htmlFor="org-plan" className="w-48">
              <Select id="org-plan" value={org.plan_id ?? ""} placeholder="Sem plano" onChange={(e) => act({ action: "plan", planId: e.target.value }, "Plano atualizado.")}
                options={plans.map((p) => ({ value: p.id, label: p.name }))} />
            </Field>
            <Field label="Prorrogar teste (dias)" htmlFor="org-days" className="w-40" hint={`Fim atual: ${fmtDate(org.trial_ends_at)}`}>
              <Input id="org-days" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
            </Field>
            <Button variant="outline" onClick={() => act({ action: "extend_trial", days: Number(days) }, "Teste prorrogado.")}>Prorrogar</Button>
          </div>
        </Section>

        <Section title="Dados da locadora">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" htmlFor="org-name"><Input {...bind("name")} /></Field>
            <Field label="Endereço (link /l/...)" htmlFor="org-slug" hint="Mudar quebra links e QR codes já divulgados."><Input {...bind("slug")} /></Field>
            <Field label="Razão social" htmlFor="org-legal_name"><Input {...bind("legal_name")} /></Field>
            <Field label="CPF/CNPJ" htmlFor="org-document"><Input {...bind("document")} /></Field>
            <Field label="E-mail" htmlFor="org-email"><Input type="email" {...bind("email")} /></Field>
            <Field label="Telefone" htmlFor="org-phone"><Input {...bind("phone")} /></Field>
            <Field label="WhatsApp" htmlFor="org-whatsapp"><Input {...bind("whatsapp")} /></Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Button onClick={() => act({ action: "update_org", ...form }, "Dados salvos.")}>Salvar dados</Button>
          </div>
        </Section>

        <Section title={`Equipe${members ? ` (${members.length})` : ""}`}>
          <div className="divide-y divide-line rounded-xl border border-line">
            {members === null && <p className="p-3 text-xs text-muted">Carregando…</p>}
            {members?.map((m) => (
              <div key={m.user_id} className="flex flex-wrap items-center gap-2 p-3 text-xs">
                <span className="min-w-0 flex-1 truncate text-white">{m.email}</span>
                <Select aria-label={`Função de ${m.email}`} value={m.role} options={ROLE_OPTIONS} className="h-8 w-44"
                  onChange={(e) => act({ action: "member_role", userId: m.user_id, role: e.target.value }, "Função alterada.", true)} />
                <Button size="icon" variant="ghost" aria-label={`Remover ${m.email}`} onClick={() => act({ action: "remove_member", userId: m.user_id }, "Membro removido.", true)}>
                  <X />
                </Button>
              </div>
            ))}
            {members?.length === 0 && <p className="p-3 text-xs text-muted">Sem membros. Adicione um proprietário abaixo.</p>}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Adicionar por e-mail (conta já cadastrada)" htmlFor="org-invite" className="min-w-56 flex-1">
              <Input id="org-invite" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="pessoa@empresa.com" />
            </Field>
            <Select aria-label="Função" value={invite.role} options={ROLE_OPTIONS} className="w-44" onChange={(e) => setInvite({ ...invite, role: e.target.value })} />
            <Button variant="outline" onClick={async () => (await act({ action: "add_member", ...invite }, "Membro adicionado.", true)) && setInvite({ ...invite, email: "" })}>
              <UserPlus /> Adicionar
            </Button>
          </div>
        </Section>

        <Section title="Suporte">
          <p className="mb-3 text-xs text-muted">
            Abre o painel desta locadora com você como administrador, para ver e corrigir o que o cliente vê. Você aparece na equipe dela e a ação fica na auditoria. Ao terminar, remova-se da equipe acima.
          </p>
          <Button variant="outline" onClick={() => act({ action: "support_access" }, "Abrindo o painel da locadora…")}>
            <LifeBuoy /> Entrar no painel desta locadora
          </Button>
        </Section>

        {!org.is_default && (
          <Section title="Excluir locadora" danger>
            <p className="mb-3 text-xs text-red-200/80">
              Apaga definitivamente a locadora e todos os dados dela: veículos, clientes, locações, contratos (inclusive assinados), pagamentos e equipe. Não tem volta. Exporte os dados antes, se precisar.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label={`Digite "${org.slug}" para confirmar`} htmlFor="org-confirm" className="min-w-56 flex-1">
                <Input id="org-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
              </Field>
              <Button variant="danger" disabled={confirm !== org.slug} onClick={async () => (await act({ action: "delete_org", confirm }, "Locadora excluída.")) && onClose()}>
                <Trash2 /> Excluir definitivamente
              </Button>
            </div>
          </Section>
        )}
      </div>
    </Dialog>
  );
}

function Section({ title, danger, children }: { title: string; danger?: boolean; children: React.ReactNode }) {
  return (
    <section className={danger ? "rounded-2xl border border-red-500/30 bg-red-500/5 p-4" : undefined}>
      <h3 className={`mb-3 text-sm font-semibold ${danger ? "text-red-200" : "text-white"}`}>{title}</h3>
      {children}
    </section>
  );
}

function PlatformConfig({ config, run }: { config: Data["config"]; run: Run }) {
  const [trial, setTrial] = useState(String(config.trial_days));
  const [grace, setGrace] = useState(String(config.grace_days));
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold">Regras da plataforma</h2>
      <p className="mt-1 text-xs text-muted">Valem para novas locadoras (teste) e para o vencimento automático (carência até suspender).</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Dias de teste grátis" htmlFor="cfg-trial" className="w-40">
          <Input id="cfg-trial" type="number" min={0} max={365} value={trial} onChange={(e) => setTrial(e.target.value)} />
        </Field>
        <Field label="Dias de carência" htmlFor="cfg-grace" className="w-40">
          <Input id="cfg-grace" type="number" min={0} max={90} value={grace} onChange={(e) => setGrace(e.target.value)} />
        </Field>
        <Button variant="outline" onClick={() => run({ action: "config", trialDays: Number(trial), graceDays: Number(grace) }, "Regras salvas.")}>Salvar</Button>
      </div>
    </section>
  );
}

function Admins({ admins, me, run }: { admins: Admin[]; me: string; run: Run }) {
  const [email, setEmail] = useState("");
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold">Super Admins ({admins.length})</h2>
      <div className="mt-3 divide-y divide-line rounded-xl border border-line">
        {admins.map((a) => (
          <div key={a.user_id} className="flex items-center gap-2 p-3 text-xs">
            <span className="min-w-0 flex-1 truncate">{a.email}{a.user_id === me && <span className="text-muted"> (você)</span>}</span>
            {a.user_id !== me && (
              <Button size="icon" variant="ghost" aria-label={`Remover ${a.email}`} onClick={() => run({ action: "remove_admin", userId: a.user_id }, "Super Admin removido.")}>
                <X />
              </Button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mail de uma conta cadastrada" aria-label="E-mail do novo Super Admin" />
        <Button variant="outline" onClick={async () => (await run({ action: "add_admin", email }, "Super Admin adicionado.")) && setEmail("")}>Adicionar</Button>
      </div>
    </section>
  );
}

function AuditList({ audit, orgs }: { audit: AuditItem[]; orgs: OrgItem[] }) {
  const name = (id: string | null, d: Record<string, unknown>) => (id ? orgs.find((o) => o.id === id)?.name ?? String(d.name ?? "locadora excluída") : "Plataforma");
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-muted" /> Últimas ações do Super Admin</h2>
      {audit.length ? (
        <ul className="mt-3 divide-y divide-line text-xs">
          {audit.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-3 py-2">
              <span className="w-32 text-muted tabular-nums">{new Date(a.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              <span className="font-medium text-white">{ACTION_LABEL[a.action] ?? a.action}</span>
              <span className="text-muted">{name(a.organization_id, a.details)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">Nenhuma ação registrada ainda.</p>
      )}
    </section>
  );
}
