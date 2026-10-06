import { normalizeIdentifier, SelsynError, type TrackedVehicle } from "./selsyn";

/** Bloqueio físico nunca usa localização antiga nem infere ignição/velocidade ausentes. */
export function validateLockSafety(tracked: TrackedVehicle, plate: string, now = Date.now()) {
  if (normalizeIdentifier(tracked.identifier) !== normalizeIdentifier(plate)) throw new SelsynError("VEHICLE_MISMATCH", "A placa na Selsyn não confere com o veículo.", 409);
  if (tracked.lockEnabled !== true) throw new SelsynError("LOCK_NOT_ENABLED", "A Selsyn não confirmou bloqueio habilitado para este rastreador.", 409);
  const recordedAt = tracked.position?.time ? Date.parse(tracked.position.time) : NaN;
  if (!Number.isFinite(recordedAt) || now - recordedAt > 60_000 || recordedAt > now + 5_000) throw new SelsynError("STALE_POSITION", "Bloqueio recusado: é necessária posição recebida há no máximo 60 segundos.", 409);
  if (tracked.position?.speed !== 0 || tracked.position?.ignition !== false) throw new SelsynError("UNSAFE_VEHICLE_STATE", "Bloqueio recusado: a Selsyn precisa confirmar velocidade zero e ignição desligada.", 409);
  if (tracked.offline === true) throw new SelsynError("VEHICLE_OFFLINE", "Bloqueio recusado: rastreador offline.", 409);
}
