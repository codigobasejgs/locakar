"use client";

import { Lock, LockOpen } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useOrganization } from "@/hooks/use-organization";
import { can } from "@/lib/permissions";
import { selsynPost } from "@/components/admin/vehicle-tracking-panel";

/** Bloqueio/desbloqueio remoto. Só dono/administrador; placa digitada e motivo obrigatórios. */
export function VehicleLockControl({ vehicleId, plate, locked, lockEnabled, onDone }: { vehicleId: string; plate: string; locked?: boolean; lockEnabled?: boolean; onDone?: () => void }) {
  const { role } = useOrganization();
  const [action, setAction] = useState<"lock" | "unlock" | null>(null);
  const [confirmPlate, setConfirmPlate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!can(role ?? undefined, "integrations")) return null;
  if (lockEnabled === false) return <p className="text-xs text-muted">Bloqueio remoto não habilitado para este rastreador na Selsyn.</p>;

  const close = () => { if (!busy) { setAction(null); setConfirmPlate(""); setReason(""); } };
  const send = async () => {
    if (!action || busy) return;
    setBusy(true);
    try {
      await selsynPost("command", { vehicleId, action, confirmPlate, reason });
      toast.success(action === "lock" ? "Comando de bloqueio enviado. Confirme o estado ao atualizar a posição." : "Comando de desbloqueio enviado. Confirme o estado ao atualizar a posição.");
      setAction(null); setConfirmPlate(""); setReason("");
      onDone?.();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  const plateOk = confirmPlate.toUpperCase().replace(/[^A-Z0-9]/g, "") === plate.toUpperCase().replace(/[^A-Z0-9]/g, "");

  return <>
    <div className="flex flex-wrap items-center gap-2" data-tour="vehicle-lock">
      <span className="text-xs text-muted">Estado informado: {locked === undefined ? "não informado" : locked ? "bloqueado" : "desbloqueado"}</span>
      <Button size="sm" variant="outline" onClick={() => setAction("lock")}><Lock />Bloquear</Button>
      <Button size="sm" variant="outline" onClick={() => setAction("unlock")}><LockOpen />Desbloquear</Button>
    </div>
    <Dialog open={!!action} onOpenChange={o => !o && close()} title={action === "lock" ? "Bloquear veículo?" : "Desbloquear veículo?"} description="O comando é enviado ao rastreador pela Selsyn e fica registrado na auditoria."
      footer={<><Button variant="ghost" disabled={busy} onClick={close}>Voltar</Button><Button variant={action === "lock" ? "danger" : "primary"} disabled={busy || !plateOk || reason.trim().length < 5} onClick={send}>{busy ? "Enviando…" : action === "lock" ? "Enviar bloqueio" : "Enviar desbloqueio"}</Button></>}>
      <div className="grid gap-4">
        {action === "lock" && <p role="alert" className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">Atenção: bloquear com o veículo em movimento pode causar acidente. Confirme que o veículo está parado ou em local seguro.</p>}
        <Field label={`Digite a placa ${plate} para confirmar`} htmlFor="lock-plate" required><Input id="lock-plate" autoComplete="off" value={confirmPlate} onChange={e => setConfirmPlate(e.target.value)} /></Field>
        <Field label="Motivo" htmlFor="lock-reason" required hint="Fica registrado na auditoria."><Textarea id="lock-reason" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      </div>
    </Dialog>
  </>;
}
