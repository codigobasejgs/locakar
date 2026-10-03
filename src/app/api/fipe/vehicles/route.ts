import { FipeError, type FipeInput } from "@/lib/fipe";
import { fipeErrorResponse, readFipeBody, saveFipeVehicle } from "@/lib/server/fipe";
import { serviceDb } from "@/lib/server/push";
import { requireStaff } from "@/lib/server/supabase";
import { audit } from "@/lib/server/tenant";
import { scoped } from "@/lib/server/org-context";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = scoped(async function GET(request: Request) {
 try {
  await requireStaff(); const id = new URL(request.url).searchParams.get("vehicleId");
  if (!id || id.length > 100) throw new FipeError("FIPE_INVALID_INPUT", "Veículo inválido.");
  const db = serviceDb();
  const [{ data: vehicle }, { data: history }] = await Promise.all([
   db.from("vehicles").select("id,fipe,fipe_price,fipe_reference_month,fipe_checked_at,purchase_value").eq("id", id).maybeSingle(),
   db.from("vehicle_fipe_history").select("*").eq("vehicle_id", id).order("reference_month").limit(200),
  ]);
  if (!vehicle) throw new FipeError("FIPE_NOT_FOUND", "Veículo não encontrado.", 404);
  return Response.json({ vehicle, history: history ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
 } catch(e) { return fipeErrorResponse(e); }
});
export const POST = scoped(async function POST(request: Request) {
 try {
  const { supabase } = await requireStaff(); const { data: claims } = await supabase.auth.getClaims();
  const b = await readFipeBody(request), actorId = claims!.claims.sub as string, db = serviceDb();
  if (typeof b.vehicleId !== "string" || b.vehicleId.length > 100) throw new FipeError("FIPE_INVALID_INPUT", "Veículo inválido.");
  const { data: v } = await db.from("vehicles").select("id,fipe").eq("id", b.vehicleId).maybeSingle();
  if (!v) throw new FipeError("FIPE_NOT_FOUND", "Veículo não encontrado.", 404);
  if (b.action === "unlink") {
   const { error } = await db.from("vehicles").update({ fipe: null, fipe_price: null, fipe_reference_month: null, fipe_checked_at: null }).eq("id", v.id);
   if (error) throw new FipeError("FIPE_SAVE_ERROR", "Não foi possível desvincular.", 503);
   await audit({ actorType: "staff", actorId, action: "fipe.unlinked", entity: "vehicles", entityId: v.id });
  } else if (["link", "update", "history"].includes(String(b.action))) {
   const input: FipeInput = b.action === "link" ? b.parameters as FipeInput : v.fipe ? { type: v.fipe.type, code: v.fipe.code, yearId: v.fipe.yearId } : {};
   await saveFipeVehicle(v.id, input, actorId, b.action === "history");
  } else throw new FipeError("FIPE_INVALID_INPUT", "Ação inválida.");
  return Response.json({ ok: true });
 } catch(e) { return fipeErrorResponse(e); }
});
