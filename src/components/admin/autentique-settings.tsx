"use client";

import { CheckCircle2, Copy, KeyRound, PlugZap, ShieldAlert, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import type { SignaturePublicConfig } from "@/lib/server/signature/service";

type Env = "sandbox" | "production";
async function api(body?: Record<string, unknown>): Promise<SignaturePublicConfig & { message?: string; webhookSecret?: string }> {
  const res = await fetch("/api/signature/config", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Não foi possível concluir.");
  return json;
}

/** Configurações → Integrações → Autentique. O navegador só recebe estado e últimos 4 caracteres. */
export function AutentiqueSettings() {
  const [cfg, setCfg] = useState<SignaturePublicConfig | null>(null);
  const [env, setEnv] = useState<Env>("sandbox");
  const [token, setToken] = useState("");
  const [secret, setSecret] = useState("");
  const [reveal, setReveal] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState({ sortable: true, reminder: "", companySignerEmail: "" });

  useEffect(() => {
    api()
      .then((c) => {
        setCfg(c);
        setEnv(c.environment);
        setDraft({ sortable: c.sortable, reminder: c.reminder ?? "", companySignerEmail: c.companySignerEmail ?? "" });
      })
      .catch((e) => toast.error((e as Error).message));
  }, []);

  if (!cfg) return <p className="text-sm text-muted sm:col-span-2">Carregando…</p>;
  const key = cfg.keys[env];
  const run = async (label: string, body: Record<string, unknown>, ok?: string) => {
    setBusy(label);
    try {
      const c = await api(body);
      setCfg(c);
      if (c.webhookSecret) setReveal(c.webhookSecret);
      toast.success(c.message ?? ok ?? "Configuração salva.");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };
  const copy = (value: string, label: string) => navigator.clipboard.writeText(value).then(() => toast.success(`${label} copiado.`), () => toast.error("Não foi possível copiar."));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm sm:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={cfg.enabled && cfg.connected ? "success" : "neutral"}>{cfg.enabled && cfg.connected ? "● Conectado" : "○ Não configurado"}</Badge>
          {cfg.environment === "sandbox" && <Badge tone="warning">MODO DE TESTE</Badge>}
        </div>
        <span className="text-xs text-muted">Assinatura eletrônica de contratos pela Autentique.</span>
      </div>

      {(!cfg.migrationReady || !cfg.masterKeyReady) && (
        <div role="alert" className="flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-200 sm:col-span-2">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span>{!cfg.migrationReady ? "Aplique a migration 20261017000000_autentique_signatures.sql. " : ""}{!cfg.masterKeyReady ? "Configure SIGNATURE_ENCRYPTION_KEY (32 bytes) no servidor." : ""}</span>
        </div>
      )}
      {env === "sandbox" && (
        <p className="flex gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200 sm:col-span-2">
          <ShieldAlert className="size-4 shrink-0" aria-hidden /> Sandbox é somente para testes: use dados fictícios. Documentos de teste são apagados pela Autentique após alguns dias.
        </p>
      )}

      <fieldset className="grid gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Ambiente</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Ambiente Autentique">
          {(["sandbox", "production"] as Env[]).map((e) => (
            <button key={e} type="button" role="radio" aria-checked={env === e} onClick={() => (setEnv(e), setToken(""))} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${env === e ? "border-magenta/60 bg-magenta/15 text-white" : "border-line text-muted hover:text-white"}`}>
              {e === "sandbox" ? "Sandbox (teste)" : "Produção"}
              <span className="block text-[11px] font-normal text-muted">{cfg.keys[e].configured ? `Token ${cfg.keys[e].maskedToken}` : "Sem token"}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2 sm:col-span-2">
        {key.configured && <p className={`flex items-center gap-1 text-xs ${key.verifiedAt ? "text-emerald-300" : "text-amber-300"}`}>{key.verifiedAt ? <CheckCircle2 className="size-3.5" /> : <TriangleAlert className="size-3.5" />}{key.verifiedAt ? "Conexão testada" : "Token salvo, ainda não testado"}</p>}
        <Field label={`Token Autentique (${env === "sandbox" ? "Sandbox" : "Produção"})`} htmlFor="autentique-token" hint="Gerado em painel.autentique.com.br → Perfil → API. Fica cifrado e não volta para o navegador.">
          <Input id="autentique-token" type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder={key.configured ? key.maskedToken ?? "Token configurado" : "••••••••••••••••"} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!!busy || token.trim().length < 20 || !cfg.masterKeyReady} onClick={async () => (await run("token", { action: "token", environment: env, token: token.trim() }, "Token salvo com segurança.")) && setToken("")}>
            <KeyRound /> {busy === "token" ? "Salvando…" : "Salvar token"}
          </Button>
          <Button size="sm" variant="outline" disabled={!!busy || !key.configured} onClick={() => run("test", { action: "test", environment: env })}>
            <PlugZap /> {busy === "test" ? "Testando…" : "Testar conexão"}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 rounded-xl border border-line p-3 text-xs sm:col-span-2">
        <p className="font-medium text-zinc-200">Webhook da Autentique</p>
        <p className="text-muted">Cadastre esta URL no painel Autentique, selecione eventos de documento e assinatura e use o mesmo segredo abaixo.</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all text-zinc-300">{cfg.webhookUrl}</code>
          <button type="button" onClick={() => copy(cfg.webhookUrl, "URL")} aria-label="Copiar URL do webhook" className="text-muted hover:text-white"><Copy className="size-4" /></button>
        </div>
        <Field label="Segredo do webhook" htmlFor="autentique-webhook" hint={cfg.webhookConfigured ? "Configurado. Deixe vazio para gerar um novo segredo." : "Deixe vazio para gerar um segredo forte."}>
          <Input id="autentique-webhook" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
        </Field>
        <Button size="sm" variant="outline" className="justify-self-start" disabled={!!busy || !cfg.masterKeyReady} onClick={async () => (await run("webhook", { action: "webhook", secret }, "Segredo salvo.")) && setSecret("")}>
          {busy === "webhook" ? "Salvando…" : "Salvar segredo"}
        </Button>
        {reveal && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2">
            <p className="text-amber-200">Copie agora. Este segredo não será exibido novamente.</p>
            <div className="mt-1 flex gap-2"><code className="min-w-0 flex-1 break-all">{reveal}</code><button type="button" onClick={() => copy(reveal, "Segredo")} aria-label="Copiar segredo"><Copy className="size-4" /></button></div>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
        <Field label="E-mail do representante da locadora" htmlFor="autentique-company-email" hint="Recebe o pedido para assinar depois do locatário.">
          <Input id="autentique-company-email" type="email" value={draft.companySignerEmail} onChange={(e) => setDraft({ ...draft, companySignerEmail: e.target.value })} />
        </Field>
        <Field label="Lembrete de assinatura" htmlFor="autentique-reminder" hint="Enviado pela Autentique apenas para signatários por e-mail.">
          <Select id="autentique-reminder" value={draft.reminder} onChange={(e) => setDraft({ ...draft, reminder: e.target.value })} options={[{ value: "", label: "Sem lembrete automático" }, { value: "DAILY", label: "Diário" }, { value: "WEEKLY", label: "Semanal" }]} />
        </Field>
        <Checkbox label="Assinar em ordem: locatário primeiro, depois locadora" checked={draft.sortable} onChange={(e) => setDraft({ ...draft, sortable: e.target.checked })} className="sm:col-span-2" />
      </div>
      {cfg.lastError && <p className="text-xs text-red-400 sm:col-span-2">Último erro: {cfg.lastError}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button disabled={!!busy} onClick={() => run("save", { action: "save", environment: env, enabled: true, ...draft })}>{busy === "save" ? "Salvando…" : "Salvar e ativar"}</Button>
        <Button variant="ghost" disabled={!!busy || !cfg.enabled} onClick={() => run("disable", { action: "save", environment: env, enabled: false, ...draft }, "Novos envios desativados. Processos existentes continuam sincronizando.")}>Desativar novos envios</Button>
      </div>
    </>
  );
}
