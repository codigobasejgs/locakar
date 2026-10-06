"use client";

import { Lock, LockOpen, RefreshCw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useOrganization } from "@/hooks/use-organization";
import { can } from "@/lib/permissions";

type Action = "lock" | "unlock" | "imei";
type Command = { id: string; action: string; status: string; created_at: string; error_code: string | null; provider_command_id?: string | null; provider_status?: string | null; provider_returned_at?: string | null; last_checked_at?: string | null; reconciliation_error?: string | null };
type State = { enabled: boolean; imeiConfigured: boolean; imeiLast4: string | null; commands: Command[]; executionTokenConfigured: boolean };
const LABEL: Record<string, string> = { reserved: "Validação pendente", sending: "Envio iniciado", accepted: "Recebido pela Selsyn; aguardando execução", confirmed: "Estado confirmado pela telemetria", rejected: "Não enviado ou rejeitado", unknown: "Resultado incerto — não repetir" };

/** Configura IMEI e envia uma intenção por UUID; senha nunca persiste no navegador. */
export function VehicleLockControl({ vehicleId, plate, locked, lockEnabled, onDone }: { vehicleId: string; plate: string; locked?: boolean; lockEnabled?: boolean; onDone?: () => void }) {
  const { role } = useOrganization();
  const allowed = can(role ?? undefined, "integrations");
  const [state, setState] = useState<State | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [confirmPlate, setConfirmPlate] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [imei, setImei] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/selsyn/command?vehicleId=${encodeURIComponent(vehicleId)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os comandos.");
    setState(data);
  }, [vehicleId]);
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    fetch(`/api/selsyn/command?vehicleId=${encodeURIComponent(vehicleId)}`, { cache: "no-store" }).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os comandos.");
      return data;
    }).then(data => alive && setState(data)).catch(e => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [allowed, vehicleId]);
  if (!allowed) return null;
  const pending = state?.commands.some(c => ["reserved","sending","accepted","unknown"].includes(c.status)) ?? false;
  const close = () => {
    if (busy) return;
    setAction(null); setConfirmPlate(""); setReason(""); setPassword(""); setImei("");
    // Não reenvia: se houve dúvida, o servidor mantém a intenção pendente e recusa UUID novo.
    requestId.current = null;
  };
  const open = (next: Action) => { requestId.current = crypto.randomUUID(); setAction(next); setError(null); };
  const call = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/selsyn/command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicleId, ...body }), cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(`${data.error ?? "Não foi possível concluir."} [${data.code ?? res.status}]`);
    return data;
  };
  const send = async () => {
    if (!action || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await call({ action, confirmPlate, reason, password, requestId: requestId.current, ...(action === "imei" ? { imei } : {}) });
      toast.success(action === "imei" ? "IMEI cadastrado para este veículo." : result.duplicate ? "Intenção já registrada; nenhum comando repetido." : result.message);
      setAction(null); setPassword(""); setConfirmPlate(""); setReason(""); setImei("");
      await load(); onDone?.();
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
    } finally { setPassword(""); setBusy(false); }
  };
  const check = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { const result = await call({ action: "check", confirmPlate: plate }); toast.message(result.message); await load(); onDone?.(); }
    catch (e) { setError((e as Error).message); await load().catch(() => {}); }
    finally { setBusy(false); }
  };
  const plateOk = confirmPlate.toUpperCase().replace(/[^A-Z0-9]/g, "") === plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return <div className="grid gap-2">
    <p className="text-xs text-muted">Estado informado: {locked === undefined ? "não informado" : locked ? "bloqueado" : "desbloqueado"}. IMEI: {state?.imeiConfigured ? `••••${state.imeiLast4}` : "não cadastrado"}.</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy || !state || pending} onClick={() => open("imei")}><Settings2 />Cadastrar IMEI</Button>
      <Button size="sm" variant="outline" disabled={busy || !state?.enabled || !state.imeiConfigured || pending || lockEnabled !== true} onClick={() => open("lock")}><Lock />Bloquear</Button>
      <Button size="sm" variant="outline" disabled={busy || !state?.enabled || !state.imeiConfigured || pending} onClick={() => open("unlock")}><LockOpen />Desbloquear</Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={check}><RefreshCw />Consultar execução do comando</Button>
    </div>
    {state && !state.enabled && <p className="text-xs text-muted">Comandos desativados no servidor. Cadastro do IMEI permanece disponível.</p>}
    {state && !state.executionTokenConfigured && <p className="text-xs text-amber-300">Consulta de execução aguardando SELSYN_ACCESS_TOKEN no servidor. Esse token é diferente da API Key; não o envie por chat.</p>}
    {pending && <p className="text-xs text-amber-300">Comando pendente ou incerto. Verifique o estado; não envie novamente. Se não houver confirmação, consulte o painel ou suporte Selsyn.</p>}
    {state?.commands.length ? <details className="text-xs"><summary className="cursor-pointer">Histórico de comandos</summary><ul className="mt-2 grid gap-1">{state.commands.map(c => <li key={c.id}>{new Date(c.created_at).toLocaleString("pt-BR")} · {c.action === "lock" ? "Bloqueio" : "Desbloqueio"} · {LABEL[c.status] ?? c.status}{c.error_code ? ` (${c.error_code})` : ""}{c.provider_command_id && <span className="block text-muted">Selsyn #{c.provider_command_id} · {c.provider_status ?? "estado não informado"} · retorno {c.provider_returned_at ? new Date(c.provider_returned_at).toLocaleString("pt-BR") : "não confirmado"}</span>}{c.last_checked_at && <span className="block text-muted">Consulta em {new Date(c.last_checked_at).toLocaleString("pt-BR")}{c.reconciliation_error ? ` · ${c.reconciliation_error}` : ""}</span>}</li>)}</ul></details> : null}
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    <Dialog open={!!action} onOpenChange={o => !o && close()} title={action === "imei" ? "Cadastrar IMEI do veículo" : action === "lock" ? "Bloquear veículo?" : "Desbloquear veículo?"} description="Somente proprietário/administrador. Sua identidade é confirmada novamente e a ação fica registrada."
      footer={<><Button variant="ghost" disabled={busy} onClick={close}>Voltar</Button><Button variant={action === "lock" ? "danger" : "primary"} disabled={busy || !plateOk || !password || (action === "imei" ? !/^\d{15}$/.test(imei) : reason.trim().length < 5)} onClick={send}>{busy ? "Confirmando…" : action === "imei" ? "Salvar IMEI" : "Enviar comando"}</Button></>}>
      <div className="grid gap-4">
        {action === "lock" && <p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">Bloqueio pode causar acidente. Exige veículo parado, ignição desligada e posição de até 60 segundos. Confirme acompanhamento responsável e local seguro.</p>}
        {action === "imei" && <Field label="IMEI confirmado no cadastro Selsyn deste veículo" htmlFor={`imei-${vehicleId}`} required hint="15 dígitos; não confundir com ID do rastreável ou modelo."><Input id={`imei-${vehicleId}`} inputMode="numeric" maxLength={15} value={imei} onChange={e => setImei(e.target.value.replace(/\D/g, ""))} /></Field>}
        <Field label={`Digite a placa ${plate}`} htmlFor={`plate-${vehicleId}`} required><Input id={`plate-${vehicleId}`} autoComplete="off" value={confirmPlate} onChange={e => setConfirmPlate(e.target.value)} /></Field>
        {action !== "imei" && <Field label="Motivo" htmlFor={`reason-${vehicleId}`} required><Textarea id={`reason-${vehicleId}`} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></Field>}
        <Field label="Confirme sua senha de acesso" htmlFor={`password-${vehicleId}`} required hint="Não é armazenada. Se usa acesso sem senha, defina uma senha antes de operar comandos."><Input id={`password-${vehicleId}`} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </div>
    </Dialog>
  </div>;
}
