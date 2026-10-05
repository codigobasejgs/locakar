"use client";

import { Ban, Copy, Download, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import type { Tone } from "@/lib/constants";
import type { Client, Contract } from "@/types";

type ProcessStatus = "sending" | "awaiting_signature" | "partially_signed" | "completed" | "rejected" | "expired" | "cancelled" | "error";
export interface SignatureState {
  process: { id: string; status: ProcessStatus; environment: "sandbox" | "production"; sent_at: string | null; completed_at: string | null; last_synced_at: string | null; last_error: string | null; original_sha256: string; signed_sha256: string | null };
  signers: { id: string; role: "client" | "company" | "witness"; sign_order: number; name: string; email: string | null; phone_last4: string | null; status: "pending" | "viewed" | "signed" | "rejected"; viewed_at: string | null; signed_at: string | null; rejected_at: string | null }[];
  events: { provider_event_id: string; event_type: string; occurred_at: string | null; status: string }[];
}
export interface SignatureInfo {
  enabled: boolean;
  environment: "sandbox" | "production";
  state: SignatureState | null;
}

export const SIGNATURE_STATUS: Record<ProcessStatus, { label: string; tone: Tone }> = {
  sending: { label: "Enviando", tone: "info" },
  awaiting_signature: { label: "Aguardando assinatura", tone: "warning" },
  partially_signed: { label: "Parcialmente assinado", tone: "info" },
  completed: { label: "Concluído", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
  expired: { label: "Expirado", tone: "neutral" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  error: { label: "Erro no envio", tone: "danger" },
};
const SIGNER_STATUS = { pending: "Pendente", viewed: "Visualizou", signed: "Assinou", rejected: "Recusou" } as const;
const ROLE = { client: "Locatário", company: "Locadora", witness: "Testemunha" } as const;
const EVENT_LABEL: Record<string, string> = {
  "document.created": "Documento criado",
  "document.updated": "Documento atualizado",
  "document.finished": "Documento concluído",
  "document.deleted": "Documento removido",
  "signature.created": "Signatário adicionado",
  "signature.viewed": "Contrato visualizado",
  "signature.accepted": "Assinatura registrada",
  "signature.rejected": "Assinatura recusada",
  "signature.delivery_failed": "Falha na entrega",
  "signature.updated": "Signatário atualizado",
};
const ACTIVE: ProcessStatus[] = ["sending", "awaiting_signature", "partially_signed"];
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const maskCpf = (cpf?: string) => (cpf ? `***.${cpf.replace(/\D/g, "").slice(3, 6)}.***-**` : "—");

async function call(contractId: string, body?: Record<string, unknown>) {
  const res = await fetch(`/api/contracts/${contractId}/signature`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
  return json;
}

/** Estado Autentique do contrato. null enquanto carrega ou quando a integração não existe (migration ausente). */
export function useContractSignature(contractId?: string) {
  const [info, setInfo] = useState<SignatureInfo | null>(null);
  const load = useCallback(async () => {
    if (!contractId) return;
    setInfo(await call(contractId).catch(() => ({ enabled: false, environment: "sandbox", state: null })));
  }, [contractId]);
  useEffect(() => {
    let alive = true;
    if (contractId) call(contractId).then((i) => alive && setInfo(i), () => alive && setInfo({ enabled: false, environment: "sandbox", state: null }));
    return () => {
      alive = false;
    };
  }, [contractId]);
  return { info, setInfo, reload: load };
}

/** Botão + modal de confirmação. O servidor revalida tudo; o modal só mostra o que será enviado. */
export function SendToAutentique({ contract, client, environment, onSent }: { contract: Contract; client?: Client; environment: "sandbox" | "production"; onSent: (s: SignatureState) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const missing = [!client?.email && !client?.phone && "e-mail ou celular", !/^\d{11}$/.test(client?.cpf?.replace(/\D/g, "") ?? "") && "CPF válido"].filter(Boolean) as string[];
  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { state } = await call(contract.id, { action: "send" });
      onSent(state);
      setOpen(false);
      toast.success("Contrato enviado para assinatura.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button data-tour="contract-autentique-send" onClick={() => setOpen(true)}>
        <Send /> Enviar para assinatura
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title="Enviar contrato para assinatura?"
        description="O contrato será enviado ao locatário pelo ambiente seguro da Autentique."
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Voltar</Button>
            <Button disabled={busy || missing.length > 0} onClick={send}>{busy ? "Enviando…" : "Enviar para assinatura"}</Button>
          </>
        }
      >
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Contrato</dt><dd className="font-mono">{contract.id.slice(0, 8).toUpperCase()}</dd></div>
          <div><dt className="text-xs text-muted">Locatário</dt><dd>{client?.name ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">E-mail</dt><dd>{client?.email || "—"}</dd></div>
          <div><dt className="text-xs text-muted">Celular</dt><dd>{client?.phone || "—"}</dd></div>
          <div><dt className="text-xs text-muted">CPF</dt><dd>{maskCpf(client?.cpf)}</dd></div>
          <div><dt className="text-xs text-muted">Ambiente</dt><dd>{environment === "sandbox" ? <Badge tone="warning">SANDBOX</Badge> : "Produção"}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">Ordem: locatário primeiro, depois o representante da locadora. Com e-mail, o pedido vai por e-mail; sem e-mail, pelo WhatsApp da Autentique.</p>
        {missing.length > 0 && <p role="alert" className="mt-3 text-sm text-red-400">Complete o cadastro do locatário: {missing.join(", ")}.</p>}
      </Dialog>
    </>
  );
}

/** Painel do processo Autentique: status, signatários, linha do tempo persistida e ações oficiais. */
export function AutentiqueProcess({ contractId, state, onChange }: { contractId: string; state: SignatureState; onChange: (s: SignatureState | null) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { process, signers, events } = state;
  const active = ACTIVE.includes(process.status);

  const act = async (action: string, fn: (r: { state?: SignatureState; url?: string; message?: string }) => Promise<void> | void) => {
    if (busy) return;
    setBusy(action);
    try {
      await fn(await call(contractId, { action }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const copyLink = () =>
    act("link", async (r) => {
      if (!r.url) return;
      try {
        await navigator.clipboard.writeText(r.url);
        toast.success("Link exclusivo do locatário copiado.");
      } catch {
        toast.message("Copie o link", { description: r.url });
      }
    });

  return (
    <div className="space-y-3" data-tour="contract-autentique-status">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ShieldCheck className="size-4 text-brand-soft" aria-hidden />
        <span>Autentique</span>
        <StatusBadge map={SIGNATURE_STATUS} value={process.status} />
        {process.environment === "sandbox" && <Badge tone="warning">SANDBOX</Badge>}
        <span className="text-xs text-muted">atualizado {when(process.last_synced_at)}</span>
      </div>
      {process.last_error && process.status === "error" && <p className="text-xs text-red-400">{process.last_error} Atualize o status antes de tentar de novo.</p>}

      <ul className="divide-y divide-line rounded-xl border border-line text-sm">
        {signers.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>
              <span className="text-xs text-muted">{s.sign_order}. {ROLE[s.role]}</span> <strong>{s.name}</strong>
              <span className="block text-xs text-muted">{s.email ?? (s.phone_last4 ? `WhatsApp ••••${s.phone_last4}` : "link")}</span>
            </span>
            <Badge tone={s.status === "signed" ? "success" : s.status === "rejected" ? "danger" : s.status === "viewed" ? "info" : "neutral"}>
              {SIGNER_STATUS[s.status]} {s.signed_at ? when(s.signed_at) : s.rejected_at ? when(s.rejected_at) : s.viewed_at ? when(s.viewed_at) : ""}
            </Badge>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2" data-tour="contract-autentique-actions">
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("sync", (r) => onChange(r.state ?? null))}>
          <RefreshCw /> {busy === "sync" ? "Consultando…" : "Atualizar status"}
        </Button>
        {active && (
          <>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={copyLink}><Copy /> Copiar link</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("resend", (r) => void toast.success(r.message ?? "Lembrete reenviado."))}><Send /> Reenviar lembrete</Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setCancelling(true)}><Ban /> Cancelar envio</Button>
          </>
        )}
        {process.status === "completed" && process.signed_sha256 && (
          <Button size="sm" disabled={!!busy} onClick={() => act("download", (r) => void (r.url && window.open(r.url, "_blank", "noopener,noreferrer")))}>
            <Download /> Baixar assinado
          </Button>
        )}
      </div>

      <details className="rounded-xl border border-line px-3 py-2 text-xs">
        <summary className="cursor-pointer text-muted">Linha do tempo e evidências</summary>
        <ol className="mt-2 space-y-1">
          {process.sent_at && <li>{when(process.sent_at)} · Enviado para assinatura</li>}
          {events.map((e) => (
            <li key={e.provider_event_id}>{when(e.occurred_at)} · {EVENT_LABEL[e.event_type] ?? e.event_type}</li>
          ))}
          {process.completed_at && <li>{when(process.completed_at)} · PDF assinado guardado</li>}
        </ol>
        <p className="mt-2 break-all text-muted">SHA-256 enviado: {process.original_sha256}</p>
        {process.signed_sha256 && <p className="break-all text-muted">SHA-256 assinado: {process.signed_sha256}</p>}
      </details>

      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancelar envio na Autentique?"
        description="O documento é bloqueado na Autentique e ninguém mais consegue assinar. O contrato continua aguardando; para mudar o texto, cancele-o e gere um novo."
        confirmLabel="Cancelar envio"
        onConfirm={() => act("cancel", (r) => onChange(r.state ?? null))}
      />
    </div>
  );
}
