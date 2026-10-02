import "server-only";
import { createHash } from "node:crypto";
import { FIPE_BASE, FIPE_TYPES, FipeError, fipeMonth, fipePath, mapFipe, type FipeDetail, type FipeInput, type FipeLink, type FipeOperation, type FipeReference } from "@/lib/fipe";
import { decrypt, hasSecretKey } from "./secret";
import { serviceDb } from "./push";
import { HttpError } from "./supabase";
import { audit } from "./tenant";

export interface FipeConfig { enabled: boolean; auto_update: boolean; key_enc: string | null; key_last4: string | null; verified_at: string | null; generation: string; last_error: string | null; cooldown_until: string | null; last_auto_at: string | null }
export async function loadFipeConfig(): Promise<FipeConfig | null> {
  const { data, error } = await serviceDb().from("fipe_config").select("*").eq("id", 1).maybeSingle();
  if (error) return null;
  return data;
}
export function publicFipeConfig(c: FipeConfig | null) {
  return { installed: Boolean(c), enabled: c?.enabled ?? false, autoUpdate: c?.auto_update ?? false, configured: Boolean(c?.key_enc), maskedKey: c?.key_last4 ? `••••••••${c.key_last4}` : null, verifiedAt: c?.verified_at ?? null, lastError: c?.last_error ?? null, lastAutoAt: c?.last_auto_at ?? null, masterKeyReady: hasSecretKey("FIPE_CONFIG_ENCRYPTION_KEY") };
}
export function fipeErrorResponse(e: unknown) {
  if (e instanceof FipeError || e instanceof HttpError) return Response.json({ error: e.message, code: e instanceof FipeError ? e.code : "ACCESS_ERROR" }, { status: e.status, headers: { "Cache-Control": "private, no-store" } });
  console.error("[fipe] INTERNAL_ERROR");
  return Response.json({ error: "Não foi possível concluir a operação FIPE.", code: "FIPE_PROVIDER_ERROR" }, { status: 503 });
}
export async function readFipeBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader(); let n = 0; const parts: Uint8Array[] = [];
  if (reader) while (true) { const r = await reader.read(); if (r.done) break; n += r.value.length; if (n > 16000) { await reader.cancel(); throw new FipeError("FIPE_INVALID_INPUT", "Pedido muito grande.", 413); } parts.push(r.value); }
  try { const o = JSON.parse(Buffer.concat(parts).toString()); if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error(); return o; }
  catch { throw new FipeError("FIPE_INVALID_INPUT", "Pedido inválido."); }
}
/** GET único; token somente em header; erro nunca inclui body/header/URL externa. */
export async function fetchFipe(operation: FipeOperation, input: FipeInput, token?: string, send: typeof fetch = fetch, timeout = 15000) {
  const path = fipePath(operation, input);
  try {
    const r = await send(`${FIPE_BASE}${path}`, { headers: { Accept: "application/json", ...(token ? { "X-Subscription-Token": token } : {}) }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeout) });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new FipeError("FIPE_UNAUTHORIZED", "Token FIPE inválido, expirado ou sem permissão para este recurso.", 424);
      if (r.status === 404) throw new FipeError("FIPE_NOT_FOUND", "Combinação não encontrada na FIPE.", 404);
      if (r.status === 429) throw new FipeError("FIPE_RATE_LIMITED", "Limite temporário de consultas FIPE atingido. Tente novamente mais tarde.", 429);
      throw new FipeError("FIPE_PROVIDER_ERROR", "Serviço FIPE temporariamente indisponível.", 503);
    }
    const reader = r.body?.getReader(); let n = 0; const parts: Uint8Array[] = [];
    if (reader) while (true) { const q = await reader.read(); if (q.done) break; n += q.value.length; if (n > 2 * 1024 * 1024) { await reader.cancel(); throw new FipeError("FIPE_INVALID_RESPONSE", "Resposta FIPE muito grande.", 424); } parts.push(q.value); }
    let json: unknown; try { json = JSON.parse(Buffer.concat(parts).toString()); } catch { throw new FipeError("FIPE_INVALID_RESPONSE", "Resposta FIPE inválida.", 424); }
    const data = mapFipe(operation, json);
    if (token && JSON.stringify(data).includes(token)) throw new FipeError("FIPE_INVALID_RESPONSE", "Resposta FIPE contém referência sensível.", 424);
    return data;
  } catch (e) {
    if (e instanceof FipeError) throw e;
    throw new FipeError(e instanceof Error && ["AbortError", "TimeoutError"].includes(e.name) ? "FIPE_TIMEOUT" : "FIPE_PROVIDER_ERROR", "A FIPE não respondeu. O cadastro manual continua disponível.", 504);
  }
}
export async function queryFipe(operation: FipeOperation, input: FipeInput, options: { test?: boolean; timeout?: number } = {}) {
  const cfg = await loadFipeConfig();
  if (!cfg) throw new FipeError("FIPE_NOT_CONFIGURED", "Aplique a migration FIPE no Supabase.", 503);
  if (!options.test && (!cfg.enabled || !cfg.verified_at)) throw new FipeError("FIPE_DISABLED", "Integração FIPE desativada. Preencha manualmente ou ative em Configurações.", 409);
  const path = fipePath(operation, input), db = serviceDb();
  let token: string | undefined;
  try { token = cfg.key_enc ? decrypt(cfg.key_enc, "FIPE_CONFIG_ENCRYPTION_KEY") : undefined; }
  catch { throw new FipeError("FIPE_NOT_CONFIGURED", "Chave mestra FIPE indisponível. Confira FIPE_CONFIG_ENCRYPTION_KEY.", 503); }
  const key = createHash("sha256").update(cfg.generation + path).digest("hex");
  if (!options.test) {
    const { data: reservation, error } = await db.rpc("reserve_fipe_query", { p_key: key });
    if (error) throw new FipeError("FIPE_NOT_CONFIGURED", "Migration/cache FIPE indisponível.", 503);
    if (reservation === "cached") { const { data } = await db.from("fipe_cache").select("data").eq("key", key).single(); if (data?.data) return data.data as ReturnType<typeof mapFipe>; }
    if (reservation !== "reserved") throw new FipeError(reservation === "busy" ? "FIPE_BUSY" : "FIPE_RATE_LIMITED", reservation === "busy" ? "Esta consulta está em andamento. Aguarde e tente novamente." : "Limite temporário de consultas FIPE atingido. Tente novamente mais tarde.", reservation === "busy" ? 409 : 429);
  }
  try {
    const data = await fetchFipe(operation, input, token, fetch, options.timeout);
    if (!options.test) await db.from("fipe_cache").update({ data, expires_at: new Date(Date.now() + (operation === "references" ? 6 : 24) * 3600000).toISOString(), locked_until: null }).eq("key", key);
    return data;
  } catch (e) {
    if (!options.test) await db.from("fipe_cache").update({ locked_until: null }).eq("key", key);
    if (e instanceof FipeError && e.code === "FIPE_RATE_LIMITED") await db.from("fipe_config").update({ cooldown_until: new Date(Date.now() + 3600000).toISOString(), last_error: e.message }).eq("id", 1);
    throw e;
  }
}
export const vehicleIdentity = (v: Record<string, unknown>) => ({ brand: v.brand, model: v.model, year: v.year, yearModel: v.year_model ?? null, type: v.vehicle_type, fuel: v.fuel });
export async function saveFipeVehicle(vehicleId: string, input: FipeInput, actorId: string | null, importHistory = false, timeout?: number) {
  const db = serviceDb(); const { data: v, error } = await db.from("vehicles").select("*").eq("id", vehicleId).maybeSingle();
  if (error || !v) throw new FipeError("FIPE_NOT_FOUND", "Veículo não encontrado.", 404);
  const refs = await queryFipe("references", {}, { timeout }) as FipeReference[];
  const current = [...refs].sort((a, b) => fipeMonth(b.month).localeCompare(fipeMonth(a.month)))[0];
  if (!current) throw new FipeError("FIPE_INVALID_RESPONSE", "Referência FIPE não encontrada.", 424);
  const parameters = { ...input, reference: current.code };
  fipePath(input.code ? "codeDetail" : "detail", parameters);
  const operation = input.code ? "codeDetail" : "detail";
  const detail = await queryFipe(operation, parameters, { timeout }) as FipeDetail;
  const expectedType = FIPE_TYPES[detail.type].label;
  const normalize = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalize(v.brand) !== normalize(detail.brand)) throw new FipeError("FIPE_INVALID_INPUT", "A marca FIPE difere do cadastro. Confirme a marca antes de vincular.");
  if (!normalize(detail.model).includes(normalize(v.model))) throw new FipeError("FIPE_INVALID_INPUT", "A versão FIPE não corresponde ao modelo comercial cadastrado. Confirme o modelo antes de vincular.");
  if (normalize(v.fuel) !== normalize(detail.fuel)) throw new FipeError("FIPE_INVALID_INPUT", "O combustível FIPE difere do cadastro. Confirme o combustível antes de vincular.");
  if (detail.type !== input.type) throw new FipeError("FIPE_INVALID_RESPONSE", "A FIPE retornou tipo de veículo divergente.", 424);
  if (v.vehicle_type !== expectedType) throw new FipeError("FIPE_INVALID_INPUT", "O tipo FIPE não corresponde ao veículo cadastrado.");
  if (detail.modelYear !== 32000 && String(v.year_model ?? "") !== String(detail.modelYear)) throw new FipeError("FIPE_INVALID_INPUT", "O ano modelo FIPE difere do cadastro. Confirme o ano modelo antes de vincular.");
  if (detail.referenceMonth !== fipeMonth(current.month)) throw new FipeError("FIPE_INVALID_RESPONSE", "A FIPE retornou referência divergente.", 424);
  if (detail.code !== (input.code ?? detail.code) || detail.modelYear !== Number(input.yearId?.split("-")[0])) throw new FipeError("FIPE_INVALID_RESPONSE", "A FIPE retornou versão/ano divergente.", 424);
  const link: FipeLink = { type: detail.type, ...(input.brandId ? { brandId: input.brandId, modelId: input.modelId } : {}), yearId: input.yearId!, code: detail.code, brand: detail.brand, version: detail.model, modelYear: detail.modelYear, fuel: detail.fuel, provider: "parallelum" };
  const history = importHistory ? (await queryFipe("history", { type: link.type, code: link.code, yearId: link.yearId, reference: current.code }, { timeout }) as FipeDetail).history : [];
  if (history.some(h => h.month > detail.referenceMonth!)) throw new FipeError("FIPE_INVALID_RESPONSE", "Histórico FIPE com referência futura inesperada.", 424);
  const { error: saveError } = await db.rpc("save_vehicle_fipe", { p_vehicle: vehicleId, p_identity: vehicleIdentity(v), p_link: link, p_price: detail.price, p_month: detail.referenceMonth, p_label: detail.referenceLabel, p_reference: current.code, p_history: history });
  if (saveError) throw new FipeError("FIPE_SAVE_ERROR", "Não foi possível salvar a FIPE. O veículo pode ter sido alterado em outra tela.", 409);
  await audit({ actorType: actorId ? "staff" : "system", actorId, action: v.fipe ? "fipe.updated" : "fipe.linked", entity: "vehicles", entityId: vehicleId, details: { code: link.code, yearId: link.yearId, previousPrice: v.fipe_price, price: detail.price, month: detail.referenceMonth } });
  return detail;
}
/** Atualização mensal limitada pelo orçamento restante do cron existente; nenhuma consulta massiva. */
export async function updateFipeBatch(deadline: number) {
  const cfg = await loadFipeConfig(); if (!cfg?.enabled || !cfg.auto_update || Date.now() + 3000 >= deadline) return { skipped: true };
  const db = serviceDb(), now = new Date().toISOString();
  const { data: lock } = await db.from("fipe_config").update({ batch_locked_until: new Date(Date.now() + 60000).toISOString() }).eq("id", 1).or(`batch_locked_until.is.null,batch_locked_until.lt.${now}`).select("id").maybeSingle();
  if (!lock) return { skipped: true };
  let updated = 0, failed = 0;
  try {
    const refs = await queryFipe("references", {}, { timeout: Math.min(5000, deadline - Date.now()) }) as FipeReference[];
    const month = refs.map(r => fipeMonth(r.month)).sort().at(-1);
    const { data: vehicles } = await db.from("vehicles").select("id,fipe,fipe_reference_month").not("fipe", "is", null).neq("status", "sold").or(`fipe_reference_month.is.null,fipe_reference_month.neq.${month}`).limit(3);
    for (const v of vehicles ?? []) {
      if (Date.now() + 12000 >= deadline) break;
      try { await saveFipeVehicle(v.id, { type: v.fipe.type, code: v.fipe.code, yearId: v.fipe.yearId }, null, false, Math.min(5000, deadline - Date.now())); updated++; }
      catch { failed++; break; }
    }
  } catch { failed++; }
  finally { await db.from("fipe_config").update({ batch_locked_until: null, last_auto_at: now }).eq("id", 1); }
  return { updated, failed };
}
