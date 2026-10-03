"use client";

import { CheckCircle2, Copy, KeyRound, PlugZap, ShieldAlert, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { BILLING_LABEL, type AsaasEnvironment } from "@/lib/asaas";
import type { AsaasPublicConfig } from "@/lib/server/asaas";

async function api(body?: Record<string, unknown>): Promise<AsaasPublicConfig & { message?: string }> {
  const res = await fetch("/api/asaas/config", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
  return json;
}

type Draft = Pick<AsaasPublicConfig, "environment" | "methods" | "allowUndefined" | "notifyAsaas" | "notifyWhatsapp" | "notifyEmail"> & { finePercent: string; interestPercent: string; discountPercent: string; discountDays: string };
const toDraft = (c: AsaasPublicConfig): Draft => ({
  environment: c.environment,
  methods: c.methods,
  allowUndefined: c.allowUndefined,
  notifyAsaas: c.notifyAsaas,
  notifyWhatsapp: c.notifyWhatsapp,
  notifyEmail: c.notifyEmail,
  finePercent: c.finePercent?.toString() ?? "",
  interestPercent: c.interestPercent?.toString() ?? "",
  discountPercent: c.discountPercent?.toString() ?? "",
  discountDays: c.discountDays?.toString() ?? "",
});

/**
 * Configurações → Asaas. A API Key é digitada aqui, vai ao servidor por HTTPS, é cifrada (AES-256-GCM) e nunca volta:
 * o navegador só recebe "configurada" + os 4 últimos caracteres. Nada fica guardado no navegador.
 */
export function AsaasSettings() {
  const [cfg, setCfg] = useState<AsaasPublicConfig | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api()
        .then((c) => alive && (setCfg(c), setDraft((d) => d ?? toDraft(c))))
        .catch((e) => alive && setError((e as Error).message));
    load();
    // Switch em Meios de pagamento muda o "Ativo" daqui também.
    window.addEventListener("locakar:payment-methods", load);
    return () => {
      alive = false;
      window.removeEventListener("locakar:payment-methods", load);
    };
  }, []);

  if (error && !cfg) return <p className="text-sm text-red-400 sm:col-span-2">{error}</p>;
  if (!cfg || !draft) return <p className="text-sm text-muted sm:col-span-2">Carregando…</p>;

  const env = draft.environment;
  const envKey = cfg.keys[env];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });
  const run = async (label: string, body: Record<string, unknown>, ok?: string) => {
    setBusy(label);
    try {
      const c = await api(body);
      setCfg(c);
      setDraft((d) => ({ ...toDraft(c), environment: d?.environment ?? c.environment }));
      window.dispatchEvent(new Event("locakar:payment-methods"));
      if (c.message) toast[c.message.startsWith("Conexão OK, mas") ? "warning" : "success"](c.message);
      else if (ok) toast.success(ok);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };
  const saveKey = async () => {
    if (await run("key", { action: "key", environment: env, apiKey: apiKey.trim() }, "API Key salva com segurança. Agora teste a conexão.")) {
      setApiKey("");
      setEditingKey(false);
    }
  };
  const prefs = (enabled: boolean) => ({ action: "save", enabled, ...draft });
  const toggleMethod = (m: string, on: boolean) => set("methods", on ? [...new Set([...draft.methods, m])] : draft.methods.filter((x) => x !== m));
  const envReady = envKey.configured && envKey.verifiedAt && envKey.webhook;

  return (
    <>
      {/* Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm sm:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={cfg.enabled ? "success" : "neutral"}>{cfg.enabled ? "Ativo" : "Desativado"}</Badge>
          {cfg.enabled && cfg.environment === "sandbox" && <Badge tone="warning">SANDBOX</Badge>}
          {cfg.enabled && cfg.environment === "production" && <Badge tone="brand">PRODUÇÃO</Badge>}
        </div>
        <span className="text-xs text-muted">Automatize cobranças e confirmações de pagamento através do Asaas.</span>
      </div>

      {(!cfg.migrationReady || !cfg.masterKeyReady) && (
        <div role="alert" className="flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200 sm:col-span-2">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span>
            {!cfg.migrationReady ? "Aplique a migration 20261008000000_asaas.sql no Supabase. " : ""}
            {!cfg.masterKeyReady ? "Configure ASAAS_ENCRYPTION_KEY (32 bytes base64) nas variáveis do servidor na Vercel e faça redeploy." : ""}
          </span>
        </div>
      )}

      {env === "sandbox" && (
        <div className="flex gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs font-medium text-amber-200 sm:col-span-2">
          <ShieldAlert className="size-4 shrink-0" aria-hidden />
          Ambiente de TESTE (Sandbox): cobranças não movimentam dinheiro real. Troque para Produção somente após homologar.
        </div>
      )}

      {/* Ambiente */}
      <fieldset className="grid gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Ambiente</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Ambiente Asaas">
          {(["sandbox", "production"] as AsaasEnvironment[]).map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={env === e}
              onClick={() => {
                set("environment", e);
                setEditingKey(false);
                setApiKey("");
              }}
              className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${env === e ? "border-magenta/60 bg-magenta/15 text-white" : "border-line text-muted hover:text-white"}`}
            >
              {e === "sandbox" ? "Sandbox (teste)" : "Produção"}
              <span className="block text-[11px] font-normal text-muted">{cfg.keys[e].configured ? `Chave ${cfg.keys[e].maskedKey}` : "Sem chave"}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {/* API Key */}
      <div className="grid gap-2 sm:col-span-2">
        {envKey.configured && !editingKey ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">API Key ({env === "sandbox" ? "Sandbox" : "Produção"})</p>
              <p className="font-mono text-sm tracking-wider">{envKey.maskedKey}</p>
              <p className={`mt-1 flex items-center gap-1 text-xs ${envReady ? "text-emerald-300" : "text-amber-300"}`}>
                {envReady ? <CheckCircle2 className="size-3.5" aria-hidden /> : <TriangleAlert className="size-3.5" aria-hidden />}
                {envReady ? "Conectado · webhook registrado" : envKey.verifiedAt ? "Conectado · webhook pendente" : "Não testada"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("test", { action: "test", environment: env })}>
                <PlugZap /> {busy === "test" ? "Testando…" : "Testar conexão"}
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setEditingKey(true)}>
                <KeyRound /> Alterar chave
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2">
            <Field label={`API Key ${env === "sandbox" ? "Sandbox ($aact_hmlg_…)" : "Produção ($aact_prod_…)"}`} htmlFor="asaas-key" hint="Gerada no Asaas em Integrações → Chaves de API. Fica cifrada no servidor e não é exibida novamente.">
              <Input id="asaas-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="••••••••••••••••" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!!busy || apiKey.trim().length < 20 || !cfg.masterKeyReady} onClick={saveKey}>
                {busy === "key" ? "Salvando…" : "Salvar chave"}
              </Button>
              {editingKey && (
                <Button size="sm" variant="ghost" onClick={() => (setEditingKey(false), setApiKey(""))}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Formas de pagamento */}
      <fieldset className="grid gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Formas de pagamento</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["PIX", "BOLETO", "CREDIT_CARD"] as const).map((m) => (
            <Checkbox key={m} label={BILLING_LABEL[m]} checked={draft.methods.includes(m)} onChange={(e) => toggleMethod(m, e.target.checked)} />
          ))}
          <Checkbox label="Permitir cliente escolher (fatura Asaas)" checked={draft.allowUndefined} onChange={(e) => set("allowUndefined", e.target.checked)} />
        </div>
        <p className="text-xs text-muted">Cartão é pago na fatura hospedada do Asaas: o LOCAKAR nunca recebe número do cartão ou CVV.</p>
      </fieldset>

      {/* Cobrança */}
      <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-4">
        <legend className="mb-1 text-sm font-medium sm:col-span-4">Configurações de cobrança (opcional)</legend>
        <Field label="Multa (%)" htmlFor="asaas-fine">
          <Input id="asaas-fine" inputMode="decimal" value={draft.finePercent} onChange={(e) => set("finePercent", e.target.value)} placeholder="Padrão da conta" />
        </Field>
        <Field label="Juros ao mês (%)" htmlFor="asaas-interest">
          <Input id="asaas-interest" inputMode="decimal" value={draft.interestPercent} onChange={(e) => set("interestPercent", e.target.value)} placeholder="Padrão da conta" />
        </Field>
        <Field label="Desconto (%)" htmlFor="asaas-discount">
          <Input id="asaas-discount" inputMode="decimal" value={draft.discountPercent} onChange={(e) => set("discountPercent", e.target.value)} placeholder="Sem desconto" />
        </Field>
        <Field label="Desconto até (dias antes)" htmlFor="asaas-discount-days">
          <Input id="asaas-discount-days" inputMode="numeric" value={draft.discountDays} disabled={!draft.discountPercent} onChange={(e) => set("discountDays", e.target.value)} placeholder="0 = até o vencimento" />
        </Field>
        <p className="text-xs text-muted sm:col-span-4">Em branco = nada é enviado (vale a configuração da sua conta Asaas). Parcelas já vencidas são cobradas com multa/juros calculados pelo LOCAKAR, com vencimento no dia.</p>
      </fieldset>

      {/* Notificações */}
      <fieldset className="grid gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Notificações da cobrança</legend>
        <Checkbox label="Asaas pode enviar notificações ao cliente (e-mail/SMS do Asaas)" checked={draft.notifyAsaas} onChange={(e) => set("notifyAsaas", e.target.checked)} />
        <Checkbox label="LOCAKAR envia WhatsApp ao gerar a cobrança" checked={draft.notifyWhatsapp} onChange={(e) => set("notifyWhatsapp", e.target.checked)} />
        <Checkbox label="LOCAKAR envia e-mail ao gerar a cobrança" checked={draft.notifyEmail} onChange={(e) => set("notifyEmail", e.target.checked)} />
        <p className="text-xs text-muted">Marque só um canal por tipo para o cliente não receber a mesma cobrança duas vezes.</p>
      </fieldset>

      {/* Webhook */}
      <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs sm:col-span-2">
        <div className="min-w-0">
          <p className="text-muted">Webhook (registrado automaticamente ao testar a conexão)</p>
          <p className="break-all font-mono text-zinc-300">{cfg.webhookUrl}</p>
        </div>
        <button type="button" onClick={() => navigator.clipboard.writeText(cfg.webhookUrl).then(() => toast.success("Copiado."), () => toast.error("Não foi possível copiar."))} className="shrink-0 text-muted hover:text-white" aria-label="Copiar URL do webhook">
          <Copy className="size-4" />
        </button>
      </div>
      {cfg.lastError && <p className="text-xs text-red-400 sm:col-span-2">Último erro: {cfg.lastError}</p>}

      <div className="grid gap-2 sm:col-span-2">
        <Button disabled={!!busy} className="justify-self-start" onClick={() => run("save", prefs(cfg.enabled), "Configuração salva.")}>{busy === "save" ? "Salvando…" : "Salvar configuração"}</Button>
        <p className="text-xs text-muted">Ative ou desative no switch Asaas em Meios de pagamento. Salvar esta seção não muda a disponibilidade.</p>
      </div>
    </>
  );
}
