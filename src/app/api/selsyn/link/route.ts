import { normalizeIdentifier, record, SelsynError, trackingId } from "@/lib/selsyn";
import { querySelsyn, readSelsynBody, selsynErrorResponse, selsynResponse, selsynStaff, assertSelsynTenant } from "@/lib/server/selsyn";
import { scoped } from "@/lib/server/org-context";
import { audit } from "@/lib/server/tenant";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const POST = scoped(async function POST(request: Request) {
  try {
    assertSelsynTenant();
    const { db, userId } = await selsynStaff();
    const body = await readSelsynBody(request);
    if (Object.keys(body).some(k => !["vehicleId", "rastreavelId", "identifier", "requestId", "unlink"].includes(k)) || typeof body.vehicleId !== "string") throw new SelsynError("INVALID_INPUT", "Veículo inválido.");
    const { data: vehicle, error: loadError } = await db.from("vehicles").select("id,plate,selsyn_rastreavel_id").eq("id", body.vehicleId).maybeSingle();
    if (loadError) throw new SelsynError("DATABASE_NOT_READY", "Aplique a migration Selsyn.", 503);
    if (!vehicle) throw new SelsynError("NOT_FOUND", "Veículo não encontrado.", 404);
    let patch: Record<string, unknown>;
    if (body.unlink === true) patch = { selsyn_rastreavel_id: null, selsyn_identificador: null, selsyn_linked_at: null };
    else {
      const id = trackingId(body.rastreavelId);
      if (!id || typeof body.identifier !== "string" || normalizeIdentifier(body.identifier) !== normalizeIdentifier(vehicle.plate)) throw new SelsynError("INVALID_INPUT", "A placa do rastreável precisa corresponder à placa deste veículo.");
      // Consulta Nível Cliente por ID (read-only); não depende de Gerenciamento de Risco.
      const result = await querySelsyn(userId, "aovivoPorRastreavel", { rastreavelId: id }, body.requestId);
      const r = record(result.data);
      if (trackingId(r.id) !== id || typeof r.identificador !== "string" || normalizeIdentifier(r.identificador) !== normalizeIdentifier(vehicle.plate)) throw new SelsynError("INVALID_INPUT", "A Selsyn não confirmou este vínculo.");
      patch = { selsyn_rastreavel_id: id, selsyn_identificador: r.identificador, selsyn_linked_at: new Date().toISOString() };
    }
    const { error } = await db.from("vehicles").update(patch).eq("id", vehicle.id);
    if (error) throw new SelsynError("LINK_ERROR", error.code === "23505" ? "Este rastreável já está vinculado a outro veículo." : "Não foi possível salvar o vínculo.", 409);
    await audit({ actorType: "staff", actorId: userId, action: body.unlink === true ? "selsyn.unlinked" : "selsyn.linked", entity: "vehicles", entityId: vehicle.id, details: { rastreavelId: patch.selsyn_rastreavel_id } });
    return selsynResponse({ ok: true });
  } catch (e) { return selsynErrorResponse(e); }
});
