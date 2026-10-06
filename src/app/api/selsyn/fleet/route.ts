import { normalizeIdentifier, record, trackingPoint, SelsynError, type TrackedVehicle } from "@/lib/selsyn";
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
      // DTO explícito no catálogo existente; a consulta de monitoramento não exige GDR.
      const result = await querySelsyn(userId, "integracaoAoVivo", {}, body.requestId);
      if (!Array.isArray(result.data)) throw new SelsynError("INVALID_PROVIDER_RESPONSE", "Posições não retornadas como lista.", 424);
      fleet = local.flatMap(v => {
        const raw = result.data instanceof Array ? result.data.find(p => typeof record(p).identificador === "string" && normalizeIdentifier(String(record(p).identificador)) === normalizeIdentifier(v.selsyn_identificador || v.plate)) : undefined;
        if (!raw || !v.selsyn_rastreavel_id) return [];
        const p = record(raw);
        return [{ id: v.selsyn_rastreavel_id, identifier: String(p.identificador), sensors: [], position: trackingPoint({ latitude: p.latitude, longitude: p.longitude, time: p.dataHora, speed: p.velocidade, ignition: p.ignicao }, v.selsyn_rastreavel_id, v.plate), communicatedAt: typeof p.dataComunicacao === "string" ? p.dataComunicacao : undefined }];
      });
    } catch (e) {
      if (!(e instanceof SelsynError)) throw e;
      providerError = { code: e.code, message: e.message, httpStatus: e.providerStatus ?? e.diagnostics?.httpStatus ?? null, retryable: e.retryable };
    }
    return selsynResponse({ fleet, vehicles: local, suggestions: [], providerError, queriedAt: new Date().toISOString() });
  } catch (e) { return selsynErrorResponse(e); }
});
