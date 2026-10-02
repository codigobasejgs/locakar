import { randomUUID } from "node:crypto";
import { FipeError } from "@/lib/fipe";
import { fipeErrorResponse, loadFipeConfig, publicFipeConfig, queryFipe, readFipeBody } from "@/lib/server/fipe";
import { encrypt, hasSecretKey } from "@/lib/server/secret";
import { serviceDb } from "@/lib/server/push";
import { requireStaff } from "@/lib/server/supabase";
import { audit } from "@/lib/server/tenant";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET() { try { await requireStaff(); return Response.json(publicFipeConfig(await loadFipeConfig()), { headers: { "Cache-Control": "private, no-store" } }); } catch (e) { return fipeErrorResponse(e); } }
export async function POST(request: Request) {
 try {
  const { supabase } = await requireStaff(); const { data: claims } = await supabase.auth.getClaims();
  const body = await readFipeBody(request), cfg = await loadFipeConfig(), db = serviceDb();
  if (!cfg) throw new FipeError("FIPE_NOT_CONFIGURED", "Aplique a migration 20261010000000_fipe.sql.", 503);
  let patch: Record<string, unknown>, action: string;
  if (body.action === "key") {
   if (!hasSecretKey("FIPE_CONFIG_ENCRYPTION_KEY")) throw new FipeError("FIPE_NOT_CONFIGURED", "Configure FIPE_CONFIG_ENCRYPTION_KEY na Vercel.", 503);
   const token = typeof body.token === "string" ? body.token.trim() : "";
   if (token.length < 8 || token.length > 500 || /\s/.test(token)) throw new FipeError("FIPE_INVALID_INPUT", "Token FIPE inválido.");
   patch = { key_enc: encrypt(token, "FIPE_CONFIG_ENCRYPTION_KEY"), key_last4: token.slice(-4), generation: randomUUID(), verified_at: null, enabled: false, last_error: null }; action = "fipe.key_changed";
  } else if (body.action === "public") {
   patch = { key_enc: null, key_last4: null, generation: randomUUID(), verified_at: null, enabled: false }; action = "fipe.public_mode";
  } else if (body.action === "test") {
   try { await queryFipe("references", {}, { test: true }); }
   catch(e) { await db.from("fipe_config").update({ verified_at: null, last_error: e instanceof FipeError ? e.message : "Falha ao testar conexão." }).eq("id", 1); throw e; }
   patch = { verified_at: new Date().toISOString(), last_error: null }; action = "fipe.connection_tested";
  } else if (body.action === "save") {
   if (typeof body.enabled !== "boolean" || typeof body.autoUpdate !== "boolean") throw new FipeError("FIPE_INVALID_INPUT", "Configuração inválida.");
   if (body.enabled && !cfg.verified_at) throw new FipeError("FIPE_NOT_CONFIGURED", "Teste a conexão antes de ativar a FIPE.", 409);
   patch = { enabled: body.enabled, auto_update: body.autoUpdate }; action = body.enabled ? "fipe.enabled" : "fipe.disabled";
  } else throw new FipeError("FIPE_INVALID_INPUT", "Ação inválida.");
  const { error } = await db.from("fipe_config").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw new FipeError("FIPE_SAVE_ERROR", "Não foi possível salvar a configuração.", 503);
  await audit({ actorType: "staff", actorId: claims?.claims.sub as string, action, entity: "fipe_config", entityId: "1" });
  return Response.json(publicFipeConfig(await loadFipeConfig()));
 } catch (e) { return fipeErrorResponse(e); }
}
