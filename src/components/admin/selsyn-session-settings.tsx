"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";

type Session = { configured: boolean; connected: boolean; state: string; accessExpiresAt: string | null; loginExpiresAt: string | null; namespace: string | null; lastError: string | null; encryptionReady: boolean };
const STATE: Record<string,string> = { disconnected: "Desconectada", connecting: "Conectando", connected: "Conectada", refreshing: "Renovando", reauth_required: "Reconexão necessária" };
export function SelsynSessionSettings() {
  const [session, setSession] = useState<Session | null>(null);
  const [open, setOpen] = useState<"connect" | "disconnect" | null>(null);
  const [login, setLogin] = useState(""); const [providerPassword, setProviderPassword] = useState("");
  const [password, setPassword] = useState(""); const [namespace, setNamespace] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/selsyn/config", { cache: "no-store" }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }).then(j => { if (alive) { setSession(j); setNamespace(j.namespace ?? ""); } }).catch(e => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, []);
  const close = () => { if (!busy) { setOpen(null); setLogin(""); setProviderPassword(""); setPassword(""); } };
  const save = async () => {
    if (!open || busy) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/selsyn/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: open, password, ...(open === "connect" ? { login, providerPassword, namespace } : {}) }), cache: "no-store" });
      const j = await r.json(); if (!r.ok) throw new Error(`${j.error ?? "Falha na sessão."} [${j.code ?? r.status}]`);
      setSession(j); setOpen(null); setLogin(""); toast.success(open === "connect" ? "Sessão Rastreame conectada. Consulta de comandos disponível com renovação automática." : "Sessão desconectada; histórico de comandos preservado.");
    } catch (e) { setError((e as Error).message); }
    finally { setProviderPassword(""); setPassword(""); setBusy(false); }
  };
  return <div className="grid gap-3 rounded-xl border border-line p-4">
    <h3 className="font-semibold">Sessão Rastreame — execução dos comandos</h3>
    <p className="text-sm text-muted">A API Key consulta a frota. Para acompanhar execução, conecte uma conta Rastreame autorizada. Os tokens ficam cifrados no servidor e são renovados; a senha Selsyn não é salva.</p>
    <p className="text-xs">Sessão: {session ? STATE[session.state] ?? session.state : "não carregada"}{session?.accessExpiresAt ? ` · token válido até ${new Date(session.accessExpiresAt).toLocaleString("pt-BR")}` : ""}</p>
    {session && !session.encryptionReady && <p className="text-xs text-amber-300">Configure SELSYN_ENCRYPTION_KEY (32 bytes em base64) no servidor antes de conectar.</p>}
    {session?.lastError && <p className="text-xs text-amber-300">Último resultado: {session.lastError}</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || !session?.encryptionReady} onClick={() => { setOpen("connect"); setError(null); }}>Conectar / reconectar Rastreame</Button><Button size="sm" variant="outline" disabled={busy || !session?.configured} onClick={() => { setOpen("disconnect"); setError(null); }}>Desconectar sessão</Button></div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    <Dialog open={!!open} onOpenChange={o => !o && close()} title={open === "disconnect" ? "Desconectar sessão Rastreame?" : "Conectar conta Rastreame"} description="Somente proprietário/administrador. Nenhum comando ao veículo é enviado por esta configuração." footer={<><Button variant="ghost" disabled={busy} onClick={close}>Voltar</Button><Button disabled={busy || !password || (open === "connect" && (!login || !providerPassword))} onClick={save}>{busy ? "Confirmando…" : open === "disconnect" ? "Desconectar" : "Conectar"}</Button></>}>
      <div className="grid gap-4">
        {open === "connect" && <>
          <p className="text-xs text-amber-300">Use uma senha nova, substituindo a que foi exposta. Não envie credenciais pelo chat.</p>
          <Field label="Login do Rastreame" htmlFor="selsyn-session-login"><Input id="selsyn-session-login" autoComplete="off" value={login} onChange={e => setLogin(e.target.value)} /></Field>
          <Field label="Nova senha do Rastreame" htmlFor="selsyn-session-provider-password"><Input id="selsyn-session-provider-password" type="password" autoComplete="off" value={providerPassword} onChange={e => setProviderPassword(e.target.value)} /></Field>
          <Field label="Base / namespace (opcional)" htmlFor="selsyn-session-namespace" hint="Somente se a conta exige uma base selecionada. Não invente valor; deixe vazio se não se aplica."><Input id="selsyn-session-namespace" value={namespace} onChange={e => setNamespace(e.target.value)} /></Field>
        </>}
        {open === "disconnect" && <p className="text-sm text-muted">Limpa tokens e login salvos. Não apaga comandos nem resolve pendências.</p>}
        <Field label="Confirme sua senha do LocaKar" htmlFor="selsyn-session-local-password"><Input id="selsyn-session-local-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
    </Dialog>
  </div>;
}
