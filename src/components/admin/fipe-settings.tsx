"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/form";
import type { publicFipeConfig } from "@/lib/server/fipe";
type Config = ReturnType<typeof publicFipeConfig>;
async function api(body?: Record<string, unknown>): Promise<Config> {
 const r = await fetch("/api/fipe/config", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
 const j = await r.json(); if (!r.ok) throw new Error(j.error); return j;
}
export function FipeSettings() {
 const [c, setC] = useState<Config | null>(null), [token, setToken] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
 useEffect(() => { let alive = true; api().then(j => alive && setC(j), e => alive && setError(e.message)); return () => { alive = false; }; }, []);
 const run = async (body: Record<string, unknown>) => { if (busy) return; setBusy(true); try { setC(await api(body)); setToken(""); toast.success(body.action === "test" ? "Conexão realizada com sucesso." : "Configuração FIPE salva."); } catch(e) { toast.error((e as Error).message); } finally { setBusy(false); } };
 if (!c) return <p className="text-sm text-muted sm:col-span-2">{error ?? "Carregando FIPE…"}</p>;
 return <div className="grid gap-3 sm:col-span-2">
  <p className="font-semibold">{c.enabled ? "Ativo" : "Desativado"} · {c.verifiedAt ? "Conectado" : "Conexão não testada"}</p>
  {!c.installed && <p className="text-sm text-amber-300">Aplique a migration 20261010000000_fipe.sql no Supabase.</p>}
  <p className="text-xs text-muted">Provider: FIPE API / Parallelum. Sem token: 500 consultas/dia; token gratuito: 1.000/dia. Histórico conforme plano. Sem consulta por placa.</p>
  <p className="text-sm">Token: {c.maskedKey ?? "Modo público (sem token)"}</p>
  <Field label="Novo token FIPE (opcional)" htmlFor="fipe-token" hint={c.masterKeyReady ? "Cifrado no servidor, nunca exibido novamente." : "Configure FIPE_CONFIG_ENCRYPTION_KEY na Vercel para cadastrar um token. O modo público não exige chave mestra."}>
   <Input id="fipe-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} />
  </Field>
  <div className="flex flex-wrap gap-2"><Button disabled={busy || !token || !c.masterKeyReady} onClick={() => run({ action: "key", token })}>Salvar token</Button><Button variant="outline" disabled={busy} onClick={() => run({ action: "test" })}>Testar conexão</Button>{c.configured && <Button variant="ghost" disabled={busy} onClick={() => run({ action: "public" })}>Usar modo público</Button>}</div>
  <Checkbox label="Ativar integração FIPE" checked={c.enabled} disabled={busy || !c.verifiedAt} onChange={e => run({ action: "save", enabled: e.target.checked, autoUpdate: c.autoUpdate })} />
  <Checkbox label="Atualizar vínculos automaticamente na nova referência mensal" checked={c.autoUpdate} disabled={busy} onChange={e => run({ action: "save", enabled: c.enabled, autoUpdate: e.target.checked })} />
  {c.lastError && <p role="alert" className="text-sm text-red-400">{c.lastError}</p>}
  <p className="text-xs text-muted">Desativar preserva preços e histórico; o cadastro manual continua disponível. Atualização automática depende do cron existente e processa lotes pequenos.</p>
 </div>;
}
