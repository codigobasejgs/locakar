"use client";

import { Copy, PlugZap, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { GATEWAYS, type GatewayEnv, type GatewayId } from "@/lib/gateways";
import { STATUS_LABEL, type PaymentMethodState } from "@/lib/payment-methods";
import { formatCurrency } from "@/lib/utils";

interface Gateway {
  id: GatewayId;
  state: PaymentMethodState;
  environment: GatewayEnv;
  credentialLast4: string | null;
  hasWebhookSecret: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  webhookUrl: string | null;
  lastTransaction: { status: string; amount_cents: number; created_at: string; last_error: string | null } | null;
}

async function api<T>(body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(body ? "/api/payments/gateways" : "/api/payments/gateways?view=config", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
  return json as T;
}

const TONE = { active: "success", inactive: "neutral", not_configured: "warning", error: "danger" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const WEBHOOK_HELP: Record<GatewayId, string> = {
  mercadopago: "Em Mercado Pago Developers → Suas integrações → Webhooks: cole a URL, marque o evento “Pagamentos” e copie a assinatura secreta para o campo abaixo.",
  pagbank: "Nada a configurar: a URL vai em cada link e o PagBank assina os avisos com o seu token.",
  pagarme: "No dashboard Pagar.me → Configurações → Webhooks: crie um webhook com esta URL e o evento “order.paid”.",
};

/**
 * Configurações → Mercado Pago, PagBank e Pagar.me (Stone). Credenciais vão ao servidor, são cifradas e nunca voltam:
 * o navegador só vê “configurada” e os 4 últimos caracteres. Ligar/desligar fica em “Meios de pagamento ativos”.
 */
export function GatewaysSettings() {
  const [list, setList] = useState<Gateway[] | null>(null);
  const [masterKey, setMasterKey] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => api<{ masterKeyReady: boolean; gateways: Gateway[] }>().then((r) => alive && (setList(r.gateways), setMasterKey(r.masterKeyReady)), (e) => alive && setError((e as Error).message));
    load();
    window.addEventListener("locakar:payment-methods", load);
    return () => {
      alive = false;
      window.removeEventListener("locakar:payment-methods", load);
    };
  }, []);

  if (error && !list) return <p className="text-sm text-red-400">{error}</p>;
  if (!list) return <p className="text-sm text-muted">Carregando…</p>;
  return (
    <div className="grid gap-4">
      {!masterKey && <p className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-300">Configure ASAAS_ENCRYPTION_KEY (chave mestra dos segredos de pagamento) na Vercel para salvar credenciais.</p>}
      {list.map((g) => <GatewayCard key={g.id} g={g} onSaved={(gs) => { setList(gs); window.dispatchEvent(new Event("locakar:payment-methods")); }} />)}
      <p className="text-xs text-muted">Ton/Stone: a Ton não tem API pública de cobrança; vendas online da Stone são feitas pela Pagar.me (mesmo grupo). Use a conta Pagar.me para receber por link com baixa automática.</p>
    </div>
  );
}

function GatewayCard({ g, onSaved }: { g: Gateway; onSaved: (gs: Gateway[]) => void }) {
  const info = GATEWAYS[g.id];
  const [environment, setEnvironment] = useState<GatewayEnv>(g.environment);
  const [credential, setCredential] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const r = await api<{ gateways: Gateway[] }>({ action: "save", provider: g.id, environment, credential: credential || undefined, webhookSecret: secret || undefined, ...extra });
      setCredential("");
      setSecret("");
      onSaved(r.gateways);
      toast.success(`${info.label}: conexão testada e salva.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success("Copiado."), () => toast.error("Não foi possível copiar."));
  const envChanged = environment !== g.environment;

  return (
    <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
        <p className="font-display font-semibold">{info.label}</p>
        <Badge tone={TONE[g.state.status]}>{STATUS_LABEL[g.state.status]}</Badge>
      </div>
      <p className="text-xs text-muted sm:col-span-2">{info.description}</p>

      <Field label="Ambiente" htmlFor={`gw-env-${g.id}`}>
        <Select id={`gw-env-${g.id}`} value={environment} onChange={(e) => setEnvironment(e.target.value as GatewayEnv)} options={[{ value: "sandbox", label: "Testes (sandbox)" }, { value: "production", label: "Produção (cobranças reais)" }]} />
      </Field>
      <Field label={info.credential} htmlFor={`gw-cred-${g.id}`} hint={g.credentialLast4 && !envChanged ? `Salvo: ••••${g.credentialLast4}. Deixe em branco para manter.` : info.credentialHint}>
        <Input id={`gw-cred-${g.id}`} type="password" autoComplete="off" value={credential} onChange={(e) => setCredential(e.target.value)} placeholder={g.credentialLast4 && !envChanged ? "••••••••" : "Cole aqui"} />
      </Field>
      {g.id === "mercadopago" && (
        <Field label="Assinatura secreta do webhook" htmlFor="gw-mp-secret" hint={g.hasWebhookSecret ? "Salva. Deixe em branco para manter." : "Suas integrações → Webhooks → Assinatura secreta"} className="sm:col-span-2">
          <Input id="gw-mp-secret" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={g.hasWebhookSecret ? "••••••••" : "Cole aqui"} />
        </Field>
      )}

      {g.webhookUrl && (
        <div className="grid gap-1 rounded-lg border border-line px-3 py-2 text-xs sm:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted">URL do webhook</p>
            <div className="flex gap-2">
              {g.id === "pagarme" && <button type="button" className="text-muted hover:text-white" aria-label="Gerar nova URL do webhook" title="Gerar nova URL (invalida a anterior)" disabled={busy} onClick={() => save({ regenerateToken: true })}><RefreshCw className="size-4" /></button>}
              <button type="button" onClick={() => copy(g.webhookUrl!)} className="text-muted hover:text-white" aria-label="Copiar URL do webhook"><Copy className="size-4" /></button>
            </div>
          </div>
          <p className="break-all font-mono text-zinc-300">{g.webhookUrl}</p>
          <p className="text-muted">{WEBHOOK_HELP[g.id]}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button size="sm" disabled={busy} onClick={() => save()}><PlugZap /> {busy ? "Testando…" : g.credentialLast4 ? "Salvar e testar conexão" : "Conectar"}</Button>
        {g.verifiedAt && <span className="text-xs text-emerald-300">Conexão OK em {when(g.verifiedAt)}</span>}
      </div>
      {g.lastError && <p className="text-xs text-red-400 sm:col-span-2">{g.lastError}</p>}
      {g.state.detail && !g.lastError && <p className="text-xs text-amber-300 sm:col-span-2">{g.state.detail}</p>}
      {g.lastTransaction && (
        <p className="text-xs text-muted sm:col-span-2">
          Última cobrança: {formatCurrency(g.lastTransaction.amount_cents / 100)} · {g.lastTransaction.status} · {when(g.lastTransaction.created_at)}
          {g.lastTransaction.last_error ? ` · ${g.lastTransaction.last_error}` : ""}
        </p>
      )}
    </div>
  );
}
