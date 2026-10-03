import { mapTrackedVehicle, normalizeIdentifier, SelsynError } from "@/lib/selsyn";
import { querySelsyn, readSelsynBody, selsynErrorResponse, selsynResponse, selsynStaff } from "@/lib/server/selsyn";
import { scoped } from "@/lib/server/org-context";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const POST = scoped(async function POST(request: Request) {
  try {
    const { userId, db } = await selsynStaff();
    const body = await readSelsynBody(request);
    if (Object.keys(body).some(k => k !== "requestId")) throw new SelsynError("INVALID_INPUT", "Pedido inválido.");
    const result = await querySelsyn(userId, "gdrAovivo", {}, body.requestId);
    const fleet = Array.isArray(result.data) ? result.data.map(mapTrackedVehicle) : [];
    const { data: vehicles, error } = await db.from("vehicles").select("id,name,plate,image,odometer,selsyn_rastreavel_id,selsyn_identificador");
    if (error) throw new SelsynError("DATABASE_NOT_READY", "Não foi possível carregar os vínculos. Confira a migration Selsyn.", 503);
    return selsynResponse({ ...result, data: undefined, fleet, vehicles: vehicles ?? [], suggestions: fleet.map(r => ({ rastreavelId: r.id, vehicleId: vehicles?.find(v => normalizeIdentifier(v.plate) === normalizeIdentifier(r.identifier))?.id ?? null })) });
  } catch (e) { return selsynErrorResponse(e); }
});
