"use client";

import { Copy, ExternalLink, FlaskConical, Mail, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { BILLING_LABEL, statusLabel, statusTone } from "@/lib/asaas";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { UnifiedPaymentItem } from "./payment-actions-sheet";

export interface AsaasCharge {
  id: string;
  status: string;
  environment: "sandbox" | "production" | null;
  provider_payment_id: string | null;
  billing_type: string | null;
  provider_status: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
  due_date: string | null;
  amount_cents: number;
  paid_amount_cents: number | null;
  refunded_cents: number | null;
  chargeback_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}
export interface AsaasPanelConfig {
  enabled: boolean;
  ready: boolean;
  environment: "sandbox" | "production";
  methods: string[];
  allowUndefined: boolean;
  notifyWhatsapp: boolean;
  notifyEmail: boolean;
}

export async function asaasApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/asaas/charges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
  return json as T;
}
/**
 * Parcela quitada/cancelada/excluída no painel: pede ao servidor para cancelar a cobrança Asaas aberta.
 * O servidor confere o estado da parcela no banco. Silencioso quando não há cobrança ou o Asaas não está instalado.
 */
export async function releaseAsaasCharge(rentalId: string, receiptId: string, reason: string) {
  try {
    const r = await asaasApi<{ result: string }>({ action: "receipt.settled", rentalId, receiptId, reason });
    if (r.result === "cancelled") toast.success("Cobrança Asaas desta parcela cancelada automaticamente.");
    if (r.result === "error") toast.error("A cobrança Asaas não foi cancelada. Cancele em Mais → Ver cobrança Asaas.");
    return r.result;
  } catch {
    return "none";
  }
}
const copy = (text: string, label: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado.`), () => toast.error("Não foi possível copiar."));
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

/**
 * "Cobrar" com Asaas: gera a cobrança (ou mostra a já existente da parcela) e exibe Pix/boleto/fatura.
 * Valor e vencimento mostrados são estimativa; o servidor recalcula antes de criar.
 */
export function AsaasChargeDialog({ payment, config, existing, onClose, onChanged }: { payment: UnifiedPaymentItem | null; config: AsaasPanelConfig; existing?: AsaasCharge | null; onClose: () => void; onChanged: (c: AsaasCharge, paid: boolean) => void }) {
  const options = [...config.methods, ...(config.allowUndefined ? ["UNDEFINED"] : [])];
  const [billingType, setBillingType] = useState(options[0] ?? "UNDEFINED");
  const [charge, setCharge] = useState<AsaasCharge | null>(existing ?? null);
  const [pix, setPix] = useState<{ image: string | null; payload: string | null } | null>(null);
  const [slip, setSlip] = useState<{ identificationField: string | null; barCode: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const open = charge?.status === "link_created";

  // Pix/boleto são obtidos sob demanda do Asaas (não ficam guardados no LOCAKAR).
  useEffect(() => {
    if (!charge || charge.status !== "link_created") return;
    let alive = true;
    if (charge.billing_type === "PIX") asaasApi<{ image: string | null; payload: string | null }>({ action: "pix", id: charge.id }).then((r) => alive && setPix(r)).catch(() => {});
    if (charge.billing_type === "BOLETO") asaasApi<{ identificationField: string | null; barCode: string | null }>({ action: "boleto", id: charge.id }).then((r) => alive && setSlip(r)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [charge]);

  if (!payment) return null;
  const expected = payment.lateCharges?.total ?? payment.amount;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(null);
  };
  const apply = (c: AsaasCharge) => {
    setCharge(c);
    onChanged(c, c.status === "paid" || c.status === "chargeback");
  };
  const create = () =>
    run("create", async () => {
      const r = await asaasApi<{ charge: AsaasCharge; reused: boolean }>({ action: "create", rentalId: payment.rentalId, receiptId: payment.id, billingType });
      apply(r.charge);
      if (r.reused) toast.message("Esta parcela já possui uma cobrança Asaas.");
      else {
        toast.success("Cobrança Asaas gerada.");
        // Envio automático conforme Configurações → Asaas (canais do LOCAKAR).
        if (config.notifyWhatsapp && payment.clientPhone) asaasApi({ action: "whatsapp", id: r.charge.id }).then(() => toast.success("Enviada no WhatsApp."), (e) => toast.error((e as Error).message));
        if (config.notifyEmail) asaasApi({ action: "email", id: r.charge.id }).then(() => toast.success("Enviada por e-mail."), (e) => toast.error((e as Error).message));
      }
    });
  const reconcile = () =>
    run("reconcile", async () => {
      const r = await asaasApi<{ charge: AsaasCharge }>({ action: "reconcile", id: charge!.id });
      apply(r.charge);
      toast.success(`Status atualizado: ${statusLabel(r.charge)}.`);
    });

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()} title={charge ? "Detalhes da cobrança" : "Cobrar cliente"} description="Cobrança pelo Asaas (Pix, boleto, cartão ou fatura)." size="md">
      <div className="grid gap-4">
        {config.environment === "sandbox" && <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200">SANDBOX — cobrança de teste, sem dinheiro real.</p>}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4 text-sm">
          <dt className="text-muted">Cliente</dt>
          <dd className="font-semibold text-white">{payment.clientName}</dd>
          <dt className="text-muted">Locação</dt>
          <dd>{payment.vehicleName} — {payment.vehiclePlate}</dd>
          <dt className="text-muted">Parcela</dt>
          <dd>{payment.description}</dd>
          <dt className="text-muted">Vencimento</dt>
          <dd>{formatDate(charge?.due_date ?? payment.dueDate)}</dd>
          <dt className="text-muted">Valor</dt>
          <dd className="font-display text-lg font-bold tabular-nums text-white">{formatCurrency(charge ? charge.amount_cents / 100 : expected)}</dd>
          {charge && (
            <>
              <dt className="text-muted">Status</dt>
              <dd className="min-w-0"><Badge tone={statusTone(charge)} className="whitespace-normal">{statusLabel(charge)}</Badge></dd>
              <dt className="text-muted">Forma</dt>
              <dd>{BILLING_LABEL[charge.billing_type ?? ""] ?? "—"}</dd>
              <dt className="text-muted">ID Asaas</dt>
              <dd className="break-all font-mono text-xs">{charge.provider_payment_id ?? "—"}</dd>
              {charge.paid_at && (<><dt className="text-muted">Pagamento</dt><dd>{when(charge.paid_at)} · {formatCurrency((charge.paid_amount_cents ?? charge.amount_cents) / 100)}</dd></>)}
              {(charge.refunded_cents ?? 0) > 0 && (<><dt className="text-muted">Estornado</dt><dd className="text-amber-300">{formatCurrency((charge.refunded_cents ?? 0) / 100)}</dd></>)}
              {charge.chargeback_status && (<><dt className="text-muted">Chargeback</dt><dd className="text-red-300">{charge.chargeback_status}</dd></>)}
              <dt className="text-muted">Criado / atualizado</dt>
              <dd className="text-xs">{when(charge.created_at)} · {when(charge.updated_at)}</dd>
            </>
          )}
        </dl>

        {!charge || charge.status === "failed" || charge.status === "cancelled" || charge.status === "refunded" ? (
          !config.ready ? (
            <p className="text-sm text-muted">Integração Asaas desativada. Ative em Configurações → Asaas para gerar novas cobranças.</p>
          ) : payment.paid || payment.cancelled ? null : (
            <div className="grid gap-3">
              {charge?.last_error && <p className="text-xs text-red-400">{charge.last_error}</p>}
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Forma de pagamento</legend>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de pagamento">
                  {options.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={billingType === m} onClick={() => setBillingType(m)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${billingType === m ? "border-magenta/60 bg-magenta/15 text-white" : "border-line text-muted hover:text-white"}`}>
                      {BILLING_LABEL[m]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" disabled={!!busy} onClick={onClose}>Cancelar</Button>
                <Button disabled={!!busy} onClick={create}>{busy === "create" ? "Gerando…" : "Gerar cobrança"}</Button>
              </div>
            </div>
          )
        ) : (
          <div className="grid gap-3">
            {open && charge.billing_type === "PIX" && (
              <div className="grid justify-items-center gap-2 rounded-xl border border-line p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Pagamento via Pix</p>
                {pix?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- QR em data URL vindo do Asaas
                  <img src={pix.image} alt={`QR Code Pix de ${formatCurrency(charge.amount_cents / 100)}`} className="size-48 rounded-lg bg-white p-2" />
                ) : (
                  <p className="text-xs text-muted">Carregando QR Code…</p>
                )}
                {pix?.payload && (
                  <>
                    <p className="w-full break-all rounded-lg bg-black/30 px-3 py-2 font-mono text-[11px] text-zinc-300">{pix.payload}</p>
                    <Button size="sm" variant="outline" onClick={() => copy(pix.payload!, "Código Pix")}><Copy /> Copiar código Pix</Button>
                  </>
                )}
              </div>
            )}
            {open && charge.billing_type === "BOLETO" && (
              <div className="grid gap-2 rounded-xl border border-line p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Boleto</p>
                {slip?.identificationField ? <p className="break-all font-mono text-xs text-zinc-300">{slip.identificationField}</p> : <p className="text-xs text-muted">Carregando linha digitável…</p>}
                <div className="flex flex-wrap gap-2">
                  {slip?.identificationField && <Button size="sm" variant="outline" onClick={() => copy(slip.identificationField!, "Linha digitável")}><Copy /> Copiar linha digitável</Button>}
                  {charge.bank_slip_url && <Button asChild size="sm" variant="outline"><a href={charge.bank_slip_url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Abrir boleto (PDF)</a></Button>}
                </div>
              </div>
            )}
            {charge.invoice_url && (
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm"><a href={charge.invoice_url} target="_blank" rel="noopener noreferrer"><ExternalLink /> Abrir fatura</a></Button>
                <Button variant="outline" size="sm" onClick={() => copy(charge.invoice_url!, "Link")}><Copy /> Copiar link</Button>
                {open && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("wa", async () => (await asaasApi({ action: "whatsapp", id: charge.id }), void toast.success(`Enviada no WhatsApp de ${payment.clientName}.`)))}><WhatsAppIcon className="size-4" /> Enviar WhatsApp</Button>}
                {open && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("mail", async () => (await asaasApi({ action: "email", id: charge.id }), void toast.success("Enviada por e-mail.")))}><Mail /> Enviar e-mail</Button>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={reconcile}><RefreshCw /> {busy === "reconcile" ? "Atualizando…" : "Atualizar status"}</Button>
              {open && config.environment === "sandbox" && charge.environment === "sandbox" && (
                <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => run("sim", async () => { const r = await asaasApi<{ charge: AsaasCharge }>({ action: "sandbox.confirm", id: charge.id }); apply(r.charge); toast.success("Pagamento simulado no Sandbox."); })}><FlaskConical /> Simular pagamento (Sandbox)</Button>
              )}
              {open && <Button variant="ghost" size="sm" disabled={!!busy} className="text-red-400" onClick={() => setConfirmCancel(true)}><XCircle /> Cancelar cobrança Asaas</Button>}
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancelar cobrança?"
        description="A cobrança será removida no Asaas e o link/Pix/boleto deixará de funcionar para o cliente. A parcela continua em aberto no LOCAKAR."
        confirmLabel="Cancelar cobrança"
        onConfirm={async () => {
          const r = await asaasApi<{ charge: AsaasCharge }>({ action: "cancel", id: charge!.id }).catch((e) => {
            toast.error((e as Error).message);
            throw e;
          });
          apply(r.charge);
          toast.success("Cobrança cancelada no Asaas.");
        }}
      />
    </Dialog>
  );
}
