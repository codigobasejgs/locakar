"use client";

import { Check, Copy, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { INVITABLE_ROLES, ROLE_LABEL } from "@/lib/permissions";
import type { OrgRole } from "@/types";

interface Member {
  user_id: string;
  role: OrgRole;
  created_at: string;
}

interface Invite {
  id: string;
  email: string;
  role: OrgRole;
  created_at: string;
  expires_at: string;
  accepted_at?: string;
  revoked_at?: string;
}

export function OrgTeamManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("operator");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const load = () => {
    fetch("/api/org")
      .then((r) => r.json())
      .then((d) => {
        setMembers(d.members || []);
        setInvites(d.invites || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", email, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao convidar.");
      toast.success("Convite gerado!");
      setLastLink(json.link);
      setEmail("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const copyLink = () => {
    if (!lastLink) return;
    navigator.clipboard.writeText(lastLink);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = async (id: string) => {
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke_invite", id }),
      });
      if (!res.ok) throw new Error("Erro ao revogar.");
      toast.success("Convite revogado.");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const removeMember = async (userId: string) => {
    if (!confirm("Remover este membro da equipe?")) return;
    try {
      const res = await fetch("/api/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_member", userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao remover.");
      toast.success("Membro removido.");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-brand-soft" />
          <div>
            <h3 className="font-semibold text-white">Equipe da Locadora ({members.length})</h3>
            <p className="text-xs text-muted">Controle quem pode acessar o painel e quais funções cada membro desempenha.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="size-4" /> Convidar usuário
        </Button>
      </div>

      {/* Membros Ativos */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="p-3 border-b border-line bg-panel text-xs font-semibold text-muted">Membros Ativos</div>
        <div className="divide-y divide-line">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between p-3 text-xs">
              <div>
                <p className="font-medium text-white font-mono text-[11px]">{m.user_id}</p>
                <p className="text-[11px] text-muted">Membro desde {new Date(m.created_at).toLocaleDateString("pt-BR")}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === "owner" ? "brand" : m.role === "admin" ? "success" : "neutral"}>
                  {ROLE_LABEL[m.role] ?? m.role}
                </Badge>
                {m.role !== "owner" && (
                  <Button size="sm" variant="danger" title="Remover" onClick={() => removeMember(m.user_id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Convites Pendentes */}
      {invites.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface overflow-hidden">
          <div className="p-3 border-b border-line bg-panel text-xs font-semibold text-muted">Convites Recentes</div>
          <div className="divide-y divide-line">
            {invites.map((i) => {
              const pending = !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date();
              return (
                <div key={i.id} className="flex items-center justify-between p-3 text-xs">
                  <div>
                    <p className="font-medium text-white">{i.email}</p>
                    <p className="text-[11px] text-muted">
                      Função: <strong>{ROLE_LABEL[i.role]}</strong> ·{" "}
                      {i.accepted_at ? "Aceito" : i.revoked_at ? "Revogado" : pending ? "Aguardando aceite" : "Expirado"}
                    </p>
                  </div>
                  {pending && (
                    <Button size="sm" variant="ghost" onClick={() => revoke(i.id)}>
                      Revogar
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Convidar */}
      <Dialog open={open} onOpenChange={setOpen} title="Convidar membro para a equipe" description="Informe o e-mail e a função da pessoa na sua locadora." size="md">
        <form onSubmit={sendInvite} className="space-y-4">
          <Field label="E-mail do convidado" htmlFor="i-email" required>
            <Input id="i-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="colaborador@sualocadora.com" />
          </Field>

          <Field label="Função" htmlFor="i-role" required>
            <Select
              id="i-role"
              value={role}
              onChange={(e) => setRole(e.target.value as OrgRole)}
              options={INVITABLE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
          </Field>

          {lastLink && (
            <div className="rounded-xl border border-line-strong bg-white/5 p-3 space-y-2">
              <p className="text-xs text-muted">Envie este link direto para o colaborador:</p>
              <div className="flex items-center gap-2">
                <input readOnly value={lastLink} className="flex-1 rounded-lg border border-line bg-panel p-2 font-mono text-[11px] text-zinc-300" />
                <Button type="button" size="sm" onClick={copyLink}>
                  {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Fechar
            </Button>
            <Button type="submit" disabled={sending}>
              <UserPlus className="size-4" /> {sending ? "Gerando..." : "Gerar convite"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
