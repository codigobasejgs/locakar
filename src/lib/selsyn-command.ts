import { normalizeIdentifier, SelsynError, type TrackedVehicle } from "./selsyn";

export function validImei(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{15}$/.test(value) || /^0+$/.test(value)) return false;
  return [...value].reduce((sum, c, i) => { let n = Number(c); if (i % 2) { n *= 2; if (n > 9) n -= 9; } return sum + n; }, 0) % 10 === 0;
}

/** Bloqueio físico nunca usa localização antiga nem infere ignição/velocidade ausentes. */
export function validateLockSafety(tracked: TrackedVehicle, plate: string, now = Date.now()) {
  if (normalizeIdentifier(tracked.identifier) !== normalizeIdentifier(plate)) throw new SelsynError("VEHICLE_MISMATCH", "A placa na Selsyn não confere com o veículo.", 409);
  if (tracked.lockEnabled !== true) throw new SelsynError("LOCK_NOT_ENABLED", "A Selsyn não confirmou bloqueio habilitado para este rastreador.", 409);
  const recordedAt = tracked.position?.time ? Date.parse(tracked.position.time) : NaN;
  if (!Number.isFinite(recordedAt) || now - recordedAt > 60_000 || recordedAt > now + 5_000) throw new SelsynError("STALE_POSITION", "Bloqueio recusado: é necessária posição recebida há no máximo 60 segundos.", 409);
  if (tracked.position?.speed !== 0 || tracked.position?.ignition !== false) throw new SelsynError("UNSAFE_VEHICLE_STATE", "Bloqueio recusado: a Selsyn precisa confirmar velocidade zero e ignição desligada.", 409);
  if (tracked.offline === true || tracked.status === "OFF_LINE") throw new SelsynError("VEHICLE_OFFLINE", "Bloqueio recusado: rastreador offline.", 409);
}


export interface CommandExecution {
  id: string; deviceId: string | null; imei: string | null; trackableId: string | null;
  type: string | null; status: string | null; sentAt: string | null; returnedAt: string | null; result: string | null;
}
/** Identidade correlacionada ao registro, nunca apenas ao "último comando" do dispositivo. */
export function assertCommandExecution(execution: CommandExecution, expected: { id: string; deviceId: string; imei: string; trackableId: string; action: "lock" | "unlock"; sentAt: string; historicalDeviceId?: string | null }, now = Date.now()) {
  const type = expected.action === "lock" ? "LOCK" : "UNLOCK";
  if (execution.id !== expected.id || execution.type !== type || execution.deviceId !== expected.deviceId) throw new SelsynError("COMMAND_IDENTITY_MISMATCH", "A Selsyn retornou outro comando, tipo ou dispositivo. O registro pendente não foi alterado.", 409);
  if (expected.historicalDeviceId) {
    if (execution.deviceId !== expected.historicalDeviceId) throw new SelsynError("COMMAND_IDENTITY_MISMATCH", "Dispositivo diferente do snapshot do comando.", 409);
  } else if (execution.imei !== expected.imei || execution.trackableId !== expected.trackableId) {
    throw new SelsynError("COMMAND_IDENTITY_UNVERIFIED", "Comando antigo sem snapshot do dispositivo. A resposta precisa comprovar IMEI e vínculo; o registro permanece pendente.", 409);
  }
  const sent = execution.sentAt ? Date.parse(execution.sentAt) : NaN;
  const local = Date.parse(expected.sentAt);
  if (!Number.isFinite(sent) || !Number.isFinite(local) || sent < local - 60_000 || sent > local + 60_000 || sent > now + 5_000) throw new SelsynError("COMMAND_TIME_MISMATCH", "Horário do comando remoto não confere com o envio registrado.", 409);
  if (execution.returnedAt && (Date.parse(execution.returnedAt) < sent || Date.parse(execution.returnedAt) > now + 5_000)) throw new SelsynError("COMMAND_TIME_MISMATCH", "Horário de retorno do dispositivo inválido.", 409);
}
