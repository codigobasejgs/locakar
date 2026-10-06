import { buildSelsynRequest, normalizeIdentifier, SelsynError } from "@/lib/selsyn";
import { querySelsyn, readSelsynBody, selsynErrorResponse, selsynResponse, selsynStaff } from "@/lib/server/selsyn";
import { scoped } from "@/lib/server/org-context";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const POST = scoped(async function POST(request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  try {
    const { userId, db } = await selsynStaff();
    const { operationId } = await params;
    const body = await readSelsynBody(request);
    if (Object.keys(body).some(k => !["requestId", "parameters"].includes(k)) || !body.parameters || typeof body.parameters !== "object" || Array.isArray(body.parameters)) throw new SelsynError("INVALID_INPUT", "Parâmetros inválidos.");
    const parameters = body.parameters as Record<string, unknown>;
    const { normalized } = buildSelsynRequest(operationId, parameters);
    const id = normalized.idRastreavel ?? normalized.rastreavelId ?? normalized.rastreavel;
    const identifier = normalized.identificador;
    const catalogOnly = operationId === "intergacaoListTipoAlerta";
    if (!id && !identifier && !catalogOnly) throw new SelsynError("VEHICLE_SCOPE_REQUIRED", "Selecione um rastreável vinculado à sua locadora; consulta global não permitida.", 403);
    if (id || identifier) {
      const { data: vehicles, error } = await db.from("vehicles").select("selsyn_rastreavel_id,selsyn_identificador,plate");
      if (error) throw new SelsynError("DATABASE_NOT_READY", "Não foi possível verificar os vínculos.", 503);
      if (!vehicles?.some(v => (!id || String(v.selsyn_rastreavel_id) === id) && (!identifier || normalizeIdentifier(v.selsyn_identificador || v.plate) === normalizeIdentifier(identifier)))) throw new SelsynError("VEHICLE_SCOPE_REQUIRED", "Rastreável não vinculado à sua locadora.", 403);
    }
    return selsynResponse(await querySelsyn(userId, operationId, parameters, body.requestId));
  } catch (e) { return selsynErrorResponse(e); }
});
