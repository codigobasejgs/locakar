import { createHash } from "node:crypto";
import { mapTrackedVehicle, normalizeIdentifier, SelsynError } from "@/lib/selsyn";
import { validImei, validateLockSafety } from "@/lib/selsyn-command";
import { assertSelsynTenant, querySelsyn, readSelsynBody, selsynErrorResponse, selsynResponse } from "@/lib/server/selsyn";
import { requireCommandOrigin, reauthenticateCommand } from "@/lib/server/selsyn-command";
import { sendSelsynCommand } from "@/lib/server/selsyn-transport";
import { requireOrg, scoped } from "@/lib/server/org-context";
import { requireStaff } from "@/lib/server/supabase";
import { serviceDb } from "@/lib/server/push";
import { audit } from "@/lib/server/tenant";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const enabled = () => process.env.SELSYN_COMMANDS_ENABLED === "true";
const history = (vehicleId: string) => serviceDb().from("selsyn_commands").select("id,action,status,reason,provider_command_id,provider_status,provider_returned_at,error_code,created_at,sent_at,finished_at").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }).limit(10);

export const GET = scoped(async function GET(request: Request) {
  try {
    await requireStaff("integrations"); assertSelsynTenant();
    const vehicleId = new URL(request.url).searchParams.get("vehicleId") ?? "";
    const { data: v, error } = await serviceDb().from("vehicles").select("id,selsyn_imei").eq("id", vehicleId).maybeSingle();
    if (error) throw new SelsynError("DATABASE_NOT_READY", "Aplique a migration Selsyn de comandos.", 503);
    if (!v) throw new SelsynError("NOT_FOUND", "Veículo não encontrado.", 404);
    const result = await history(v.id);
    if (result.error) throw new SelsynError("DATABASE_NOT_READY", "Aplique a migration Selsyn de comandos.", 503);
    return selsynResponse({ enabled: enabled(), imeiConfigured: validImei(v.selsyn_imei), imeiLast4: v.selsyn_imei?.slice(-4) ?? null, commands: result.data });
  } catch (e) { return selsynErrorResponse(e); }
});

/** Uma intenção durável = no máximo um PUT. Nunca repetir timeout/resultado incerto. */
export const POST = scoped(async function POST(request: Request) {
  try {
    const { userId } = await requireStaff("integrations"); assertSelsynTenant(); requireCommandOrigin(request);
    const body = await readSelsynBody(request);
    if (Object.keys(body).some(k => !["vehicleId","action","confirmPlate","reason","password","requestId","imei"].includes(k))) throw new SelsynError("INVALID_INPUT", "Pedido inválido.");
    if (typeof body.vehicleId !== "string") throw new SelsynError("INVALID_INPUT", "Veículo inválido.");
    const db = serviceDb();
    const { data: v, error } = await db.from("vehicles").select("id,plate,selsyn_rastreavel_id,selsyn_imei").eq("id", body.vehicleId).maybeSingle();
    if (error) throw new SelsynError("DATABASE_NOT_READY", "Aplique a migration Selsyn de comandos.", 503);
    if (!v?.selsyn_rastreavel_id) throw new SelsynError("VEHICLE_SCOPE_REQUIRED", "Veículo sem rastreador nesta locadora.", 403);
    if (typeof body.confirmPlate !== "string" || normalizeIdentifier(body.confirmPlate) !== normalizeIdentifier(v.plate)) throw new SelsynError("CONFIRMATION_REQUIRED", "Digite a placa correta para confirmar.", 422);
    const action = body.action;
    if (!["imei","lock","unlock","check"].includes(String(action))) throw new SelsynError("INVALID_INPUT", "Ação inválida.");
    if (action === "imei") {
      if (!validImei(body.imei)) throw new SelsynError("INVALID_INPUT", "IMEI inválido: informe os 15 dígitos, sem o modelo.");
      await reauthenticateCommand(userId, body.password);
      const { error: saved } = await db.from("vehicles").update({ selsyn_imei: body.imei }).eq("id", v.id).eq("selsyn_rastreavel_id", v.selsyn_rastreavel_id).eq("plate", v.plate).select("id").single();
      if (saved) throw new SelsynError("LINK_ERROR", "Não foi possível gravar o IMEI. Resolva comandos pendentes ou atualize a página.", 409);
      await audit({ actorType: "staff", actorId: userId, action: "selsyn.imei_configured", entity: "vehicles", entityId: v.id, details: { last4: body.imei.slice(-4), rastreavelId: v.selsyn_rastreavel_id } });
      return selsynResponse({ ok: true, imeiLast4: body.imei.slice(-4) });
    }
    if (action === "check") {
      const { data: pending, error: pendingError } = await history(v.id);
      if (pendingError) throw new SelsynError("DATABASE_NOT_READY", "Não foi possível consultar os comandos.", 503);
      const c = pending?.find(p => p.status === "accepted");
      if (c?.sent_at) {
        const live = await querySelsyn(userId, "aovivoPorRastreavel", { rastreavelId: v.selsyn_rastreavel_id });
        const tracked = mapTrackedVehicle(live.data);
        const time = tracked.position?.time ? Date.parse(tracked.position.time) : NaN;
        if (c.provider_returned_at && tracked.id === v.selsyn_rastreavel_id && normalizeIdentifier(tracked.identifier) === normalizeIdentifier(v.plate) && time > Math.max(Date.parse(c.sent_at), Date.parse(c.provider_returned_at)) && time <= Date.now() + 5000 && tracked.locked === (c.action === "lock")) {
          const { error: confirmed } = await db.from("selsyn_commands").update({ status: "confirmed", finished_at: new Date().toISOString() }).eq("id", c.id).eq("status", "accepted");
          if (confirmed) throw new SelsynError("DATABASE_NOT_READY", "Não foi possível registrar a confirmação.", 503);
        }
      }
      const result = await history(v.id);
      if (result.error) throw new SelsynError("DATABASE_NOT_READY", "Não foi possível carregar o histórico de comandos.", 503);
      return selsynResponse({ commands: result.data, message: "Estado consultado. A confirmação exige retorno do dispositivo e telemetria posterior. Se a Selsyn não fornecer o retorno, confirme com o suporte antes de qualquer nova ação." });
    }
    const commandAction = action === "lock" ? "lock" : action === "unlock" ? "unlock" : null;
    if (!commandAction) throw new SelsynError("INVALID_INPUT", "Comando não permitido.");
    if (!enabled()) throw new SelsynError("COMMANDS_DISABLED", "Comandos remotos desativados no servidor.", 409);
    if (!validImei(v.selsyn_imei)) throw new SelsynError("IMEI_REQUIRED", "Cadastre o IMEI deste veículo antes de enviar comando.", 409);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 300 || typeof body.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)) throw new SelsynError("INVALID_INPUT", "Informe motivo e identificador válidos.");
    await reauthenticateCommand(userId, body.password);
    const hash = createHash("sha256").update(JSON.stringify([v.id,action,reason,v.plate,v.selsyn_rastreavel_id,v.selsyn_imei])).digest("hex");
    const { data: reservation, error: reserveError } = await db.rpc("reserve_selsyn_command", { p_org: requireOrg().org.id, p_id: body.requestId, p_vehicle: v.id, p_actor: userId, p_action: action, p_hash: hash, p_reason: reason });
    if (reserveError) throw new SelsynError("DATABASE_NOT_READY", "Não foi possível reservar o comando.", 503);
    if (reservation?.result === "duplicate") return selsynResponse({ duplicate: true, commandId: reservation.id, status: reservation.status });
    if (reservation?.result !== "reserved") throw new SelsynError("COMMAND_NOT_RESERVED", `Comando não enviado (${reservation?.result ?? "indisponível"}). Há comando pendente ou vínculo incompleto; confira o histórico.`, 409);
    const id = body.requestId;
    let dispatched = false;
    try {
      if (reservation.identifier !== v.plate || reservation.trackableId !== v.selsyn_rastreavel_id || reservation.imei !== v.selsyn_imei) throw new SelsynError("VEHICLE_MISMATCH", "Vínculo mudou durante a reserva. Atualize a página antes de continuar.", 409);
      if (action === "lock") {
        const live = await querySelsyn(userId, "aovivoPorRastreavel", { rastreavelId: v.selsyn_rastreavel_id });
        const tracked = mapTrackedVehicle(live.data);
        if (tracked.id !== v.selsyn_rastreavel_id) throw new SelsynError("VEHICLE_MISMATCH", "Rastreável diferente do vínculo.", 409);
        validateLockSafety(tracked, v.plate);
      }
      const sentAt = new Date().toISOString();
      const { error: sending } = await db.from("selsyn_commands").update({ status: "sending", sent_at: sentAt }).eq("id", id).eq("status", "reserved").select("id").single();
      if (sending) throw new SelsynError("DATABASE_NOT_READY", "Não foi possível persistir a intenção de envio.", 503);
      dispatched = true;
      const receipt = await sendSelsynCommand(commandAction, normalizeIdentifier(v.plate), v.selsyn_imei, process.env.SELSYN_API_KEY ?? "");
      const { error: saved } = await db.from("selsyn_commands").update({ status: "accepted", provider_command_id: receipt.id, provider_status: receipt.status, provider_returned_at: receipt.returnedAt }).eq("id", id);
      if (saved) throw new SelsynError("COMMAND_UNCERTAIN", "A Selsyn recebeu o comando, mas o registro falhou. Não repita.", 503);
      await audit({ actorType: "staff", actorId: userId, action: "selsyn.command_received", entity: "vehicles", entityId: v.id, details: { commandId: id, action, providerId: receipt.id } });
      return selsynResponse({ commandId: id, status: "accepted", message: "Comando recebido pela Selsyn. Execução física ainda não confirmada; atualize o estado." });
    } catch (e) {
      const definitelyRejected = !dispatched || (e instanceof SelsynError && [400,401,403,404,422].includes(e.providerStatus ?? 0));
      await db.from("selsyn_commands").update({ status: definitelyRejected ? "rejected" : "unknown", error_code: e instanceof SelsynError ? e.code : "INTERNAL_ERROR", finished_at: new Date().toISOString() }).eq("id", id);
      throw e;
    }
  } catch (e) { return selsynErrorResponse(e); }
});
