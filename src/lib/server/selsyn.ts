import "server-only";
import { fetchSelsyn } from "./selsyn-transport";
import { createHash, randomUUID } from "node:crypto";
import { buildSelsynRequest, SelsynError, type Json } from "@/lib/selsyn";
import { requireStaff, HttpError } from "@/lib/server/supabase";
import { serviceDb } from "@/lib/server/push";
import { audit } from "@/lib/server/tenant";

export const selsynRefreshSeconds = () => Math.max(60, Math.min(3600, Number(process.env.SELSYN_POSITION_REFRESH_SECONDS) || 120));
export async function selsynStaff() {
  const { supabase } = await requireStaff();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) throw new HttpError(401, "Sessão expirada.");
  return { db: serviceDb(), userId: data.claims.sub as string };
}
export function selsynResponse(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
export function selsynErrorResponse(e: unknown) {
  if (e instanceof SelsynError) return selsynResponse({ error: e.message, code: e.code }, e.status);
  if (e instanceof HttpError) return selsynResponse({ error: e.message, code: "ACCESS_ERROR" }, e.status);
  // Não registrar exceção/fetch request: a URL do fornecedor contém credencial na query.
  console.error("[selsyn] INTERNAL_ERROR");
  return selsynResponse({ error: "Não foi possível realizar a consulta.", code: "INTERNAL_ERROR" }, 500);
}
export async function readSelsynBody(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 16000) throw new SelsynError("INVALID_INPUT", "Pedido muito grande.", 413);
  const reader = request.body?.getReader();
  let text = ""; let bytes = 0;
  const decoder = new TextDecoder();
  if (reader) while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.length;
    if (bytes > 16000) { await reader.cancel(); throw new SelsynError("INVALID_INPUT", "Pedido muito grande.", 413); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new SelsynError("INVALID_INPUT", "Pedido inválido."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SelsynError("INVALID_INPUT", "Pedido inválido.");
  return body as Record<string, unknown>;
}

/** Único transporte Selsyn. Chave cliente na QUERY, conforme securitySchemes (operador é diferente). */
export async function querySelsyn(userId: string, operationId: string, input: Record<string, unknown>, requestId: unknown = randomUUID()) {
  const key = process.env.SELSYN_API_KEY;
  if (!key) throw new SelsynError("NOT_CONFIGURED", "Configure SELSYN_API_KEY no backend para consultar.", 503);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId))) throw new SelsynError("INVALID_INPUT", "Identificador de consulta inválido.");
  const id = String(requestId);
  const { normalized } = buildSelsynRequest(operationId, input);
  const hash = createHash("sha256").update(operationId + JSON.stringify(Object.entries(normalized).sort())).digest("hex");
  const db = serviceDb();
  const { data: reservation, error } = await db.rpc("reserve_selsyn_request", { p_id: id, p_operator: userId, p_operation: operationId, p_hash: hash });
  if (error) throw new SelsynError("DATABASE_NOT_READY", "Aplique a migration Selsyn no Supabase antes de consultar.", 503);
  if (reservation !== "reserved") throw new SelsynError(reservation === "limited" ? "RATE_LIMITED" : "DUPLICATE_REQUEST", reservation === "limited" ? "Limite interno de consultas atingido. Aguarde um minuto." : "Uma consulta já foi enviada. Aguarde sua conclusão.", reservation === "limited" ? 429 : 409);
  const started = Date.now();
  await audit({ actorType: "staff", actorId: userId, action: "selsyn.started", entity: "selsyn_requests", entityId: id, details: { operation: operationId } });
  console.info("[selsyn] started", { id, operation: operationId });
  try {
    const response = await fetchSelsyn(operationId, input, key);
    const duration = Date.now() - started;
    const { error: finishError } = await db.from("selsyn_requests").update({ status: "success", duration_ms: duration, finished_at: new Date().toISOString() }).eq("id", id);
    if (finishError) throw new SelsynError("INTERNAL_ERROR", "Não foi possível registrar o resultado da consulta.", 500);
    await audit({ actorType: "staff", actorId: userId, action: "selsyn.completed", entity: "selsyn_requests", entityId: id, details: { operation: operationId, durationMs: duration } });
    console.info("[selsyn] completed", { id, operation: operationId, durationMs: duration });
    return { ...response, requestId: id, queriedAt: new Date().toISOString() };
  } catch (e) {
    const safe = e instanceof SelsynError ? e : e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? new SelsynError("TIMEOUT", "A Selsyn demorou para responder. Não houve nova tentativa automática.", 504) : new SelsynError("PROVIDER_UNREACHABLE", "Não foi possível conectar ao servidor Selsyn.", 503);
    await db.from("selsyn_requests").update({ status: "error", error_code: safe.code, duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", id);
    await audit({ actorType: "staff", actorId: userId, action: "selsyn.error", entity: "selsyn_requests", entityId: id, details: { operation: operationId, code: safe.code, durationMs: Date.now() - started } });
    console.warn("[selsyn] error", { id, operation: operationId, code: safe.code });
    throw safe;
  }
}
export type SelsynResult = { data: Json; requestId: string; queriedAt: string };
