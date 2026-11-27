/**
 * Detecção de conflito de períodos por veículo (reservas e locações).
 * Sem dependências para rodar também em `npm run check`. Datas ISO comparam como string.
 */
export interface Period {
  id?: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  status?: string;
}

const INACTIVE_STATUSES = new Set(["cancelled", "completed", "finished"]);

/** Locação em curso: o carro está com o cliente. */
export const isOngoing = (status?: string) => status === "active" || status === "late";

/** Veículos com locação em curso (ignora `exceptRentalId`, a locação que está sendo editada). */
export function busyVehicleIds(rentals: readonly { id?: string; vehicleId: string; status?: string }[], exceptRentalId?: string) {
  return new Set(rentals.filter((r) => r.id !== exceptRentalId && isOngoing(r.status)).map((r) => r.vehicleId));
}

/** Clientes com locação em curso (mesma regra dos veículos): somem do seletor de nova locação. */
export function busyClientIds(rentals: readonly { id?: string; clientId: string; status?: string }[], exceptRentalId?: string) {
  return new Set(rentals.filter((r) => r.id !== exceptRentalId && isOngoing(r.status)).map((r) => r.clientId));
}

/**
 * Status real do veículo a partir das locações (o status gravado pode ficar velho se uma locação
 * foi excluída/cancelada). Vendido e manutenção são decisão da equipe e prevalecem.
 */
export function vehicleState<S extends string>(v: { id: string; status: S }, busy: Set<string>): S | "rented" | "available" {
  if (v.status === "sold" || v.status === "maintenance") return v.status;
  if (busy.has(v.id)) return "rented";
  return v.status === "rented" ? "available" : v.status;
}

/** Pode entrar numa nova locação: não vendido, fora de manutenção e sem locação em curso. */
export const canRent = (v: { id: string; status: string }, busy: Set<string>) => v.status !== "sold" && v.status !== "maintenance" && !busy.has(v.id);

export function findConflict<T extends Period>(items: readonly T[], candidate: Period): T | undefined {
  if (INACTIVE_STATUSES.has(candidate.status ?? "")) return undefined;
  return items.find(
    (item) =>
      item.id !== candidate.id &&
      item.vehicleId === candidate.vehicleId &&
      !INACTIVE_STATUSES.has(item.status ?? "") &&
      item.startDate <= candidate.endDate &&
      candidate.startDate <= item.endDate,
  );
}
