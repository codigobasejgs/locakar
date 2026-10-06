import { mapTrackedVehicle, record, SelsynError, type TrackedVehicle } from "@/lib/selsyn";
import { assertSelsynTenant, querySelsyn, readSelsynBody, selsynErrorResponse, selsynResponse, selsynStaff } from "@/lib/server/selsyn";
import { scoped } from "@/lib/server/org-context";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const POST = scoped(async function POST(request: Request) {
  try {
    const { userId, db } = await selsynStaff();
    assertSelsynTenant();
    const body = await readSelsynBody(request);
    if (Object.keys(body).some(k => k !== "requestId")) throw new SelsynError("INVALID_INPUT", "Pedido inválido.");
    const { data: vehicles, error } = await db.from("vehicles").select("id,name,plate,image,odometer,selsyn_rastreavel_id,selsyn_identificador");
    if (error) throw new SelsynError("DATABASE_NOT_READY", "Não foi possível carregar os vínculos. Confira as migrations Selsyn e SaaS.", 503);
    const local = vehicles ?? [];
    let fleet: TrackedVehicle[] = [];
    let providerError: { code: string; message: string; httpStatus: number | null; retryable: boolean } | null = null;
    try {
      // Consulta Nível Cliente: uma chamada traz posição, sensores e estado de bloqueio de todos os rastreáveis da chave.
      const result = await querySelsyn(userId, "aovivo", { format: "JSON" }, body.requestId);
      const items = record(record(result.data).content).items;
      if (!Array.isArray(items)) throw new SelsynError("INVALID_PROVIDER_RESPONSE", "Posições não retornadas como lista.", 424);
      // Só rastreáveis vinculados a veículos desta locadora; o resto da conta nunca sai do servidor.
      const linked = new Map(local.flatMap(v => v.selsyn_rastreavel_id ? [[String(v.selsyn_rastreavel_id), v] as const] : []));
      fleet = items.flatMap(raw => {
        const id = String(record(raw).id ?? "");
        if (!linked.has(id)) return [];
        try { return [mapTrackedVehicle(raw)]; } catch { return []; }
      });
    } catch (e) {
      if (!(e instanceof SelsynError)) throw e;
      providerError = { code: e.code, message: e.message, httpStatus: e.providerStatus ?? e.diagnostics?.httpStatus ?? null, retryable: e.retryable };
    }
    return selsynResponse({ fleet, vehicles: local, suggestions: [], providerError, queriedAt: new Date().toISOString() });
  } catch (e) { return selsynErrorResponse(e); }
});
