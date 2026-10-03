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
