import "server-only";
import { validImei, type CommandExecution } from "../selsyn-command";
import { buildSelsynRequest, providerError, providerErrorBody, sanitizeSelsyn, SELSYN_BASE, SelsynError, validateSelsynResponse, type Json, type SelsynDiagnostics } from "../selsyn";

export interface SelsynFile { name: string; mime: string; base64: string }
/** Transporte único, testável com fetch simulado; não registra URLs que contenham a credencial. */
export async function fetchSelsyn(operationId: string, input: Record<string, unknown>, key: string, send: typeof fetch = fetch): Promise<{ data: Json; file?: SelsynFile; diagnostics: SelsynDiagnostics }> {
  if (!key) throw new SelsynError("NOT_CONFIGURED", "Configure SELSYN_API_KEY no backend para consultar.", 503);
  const { path, query } = buildSelsynRequest(operationId, input);
  const url = new URL(path.replace(/^\//, ""), SELSYN_BASE);
  url.search = query.toString();
  const started = Date.now();
  const diagnostics = { operationId, method: "GET" as const, pathname: url.pathname, timestamp: new Date().toISOString(), httpStatus: null as number | null, contentType: null as string | null, requestId: null as string | null, durationMs: 0 };
  try {
    // O OpenAPI documenta api-key-cliente na query, mas a API em produção responde 403 nesse formato e 200
    // com a mesma chave no header x-api-key (testado em 06/10/2026 nas 4 operações). Header também tira a chave da URL.
    const res = await send(url, { method: "GET", headers: { Accept: "application/json", "x-api-key": key }, signal: AbortSignal.timeout(12000), redirect: "error", cache: "no-store" });
    diagnostics.httpStatus = res.status;
    diagnostics.contentType = res.headers.get("content-type")?.split(";")[0].trim().slice(0, 100) ?? null;
    const requestId = res.headers.get("x-request-id") ?? res.headers.get("x-correlation-id");
    diagnostics.requestId = requestId && /^[A-Za-z0-9_-]{1,100}$/.test(requestId) && !requestId.includes(key) ? requestId : null;
    if (!res.ok) {
      const err = providerError(res.status);
      (diagnostics as SelsynDiagnostics).providerBody = providerErrorBody(await res.text().catch(() => ""), key);
      throw err;
    }
    if (Number(res.headers.get("content-length")) > 8 * 1024 * 1024) throw new SelsynError("RESPONSE_TOO_LARGE", "Consulta muito grande. Reduza o período ou o tamanho da página.", 424);
    const reader = res.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 8 * 1024 * 1024) { await reader.cancel(); throw new SelsynError("RESPONSE_TOO_LARGE", "Consulta muito grande. Reduza o período.", 424); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks);
    const mime = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    // Alguns fornecedores enviam o arquivo diretamente para os formatos oficiais. Nunca fabricamos exportações.
    const format = String(input.format ?? "JSON");
    let extension: string | undefined;
    if (format.startsWith("PDF_") && mime === "application/pdf" && body.subarray(0, 5).toString() === "%PDF-") extension = "pdf";
    if (format === "XLSX" && mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" && body[0] === 0x50 && body[1] === 0x4b) extension = "xlsx";
    if (format === "HTML" && mime === "text/html") extension = "html";
    if (extension) {
      if (body.includes(Buffer.from(key)) || body.includes(Buffer.from(encodeURIComponent(key)))) throw new SelsynError("UNSAFE_EXPORT", "A exportação contém referência sensível e não pode ser entregue.", 424);
      return { data: null, file: { name: `selsyn-${operationId}.${extension}`, mime: mime!, base64: body.toString("base64") }, diagnostics: { ...diagnostics, durationMs: Date.now() - started } };
    }
    let raw: unknown;
    try { raw = body.toString("utf8").trim() ? JSON.parse(body.toString("utf8")) : null; } catch { throw new SelsynError("INVALID_PROVIDER_RESPONSE", "A Selsyn retornou um formato não documentado para esta consulta/exportação.", 424); }
    // Relatórios: a Selsyn devolve o PDF/XLSX em base64 dentro de content (verificado em 06/10/2026).
    const content = raw && typeof raw === "object" ? (raw as { content?: unknown }).content : undefined;
    if (typeof content === "string" && content.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(content.slice(0, 400))) {
      const bytes = Buffer.from(content, "base64");
      const kind = bytes.subarray(0, 5).toString("latin1") === "%PDF-" ? ["pdf", "application/pdf"] : bytes[0] === 0x50 && bytes[1] === 0x4b ? ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] : null;
      if (kind) {
        if (bytes.length > 8 * 1024 * 1024) throw new SelsynError("RESPONSE_TOO_LARGE", "Arquivo maior que o limite de 8 MB. Reduza o período.", 424);
        if (bytes.includes(Buffer.from(key)) || bytes.includes(Buffer.from(encodeURIComponent(key)))) throw new SelsynError("UNSAFE_EXPORT", "A exportação contém referência sensível e não pode ser entregue.", 424);
        return { data: null, file: { name: `selsyn-${operationId}.${kind[0]}`, mime: kind[1], base64: bytes.toString("base64") }, diagnostics: { ...diagnostics, durationMs: Date.now() - started } };
      }
    }
    return { data: sanitizeSelsyn(validateSelsynResponse(operationId, raw), key), diagnostics: { ...diagnostics, durationMs: Date.now() - started } };
  } catch (e) {
    if (e instanceof SelsynError) {
      e.diagnostics = { ...diagnostics, durationMs: Date.now() - started };
      throw e;
    }
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new SelsynError("TIMEOUT", "A Selsyn demorou para responder. Não houve nova tentativa automática.", 504);
    // Só o código de rede (ex.: UND_ERR_CONNECT_TIMEOUT, ENOTFOUND); nunca a URL, que contém a credencial.
    const cause = (e as { cause?: { code?: unknown } })?.cause?.code;
    const net = typeof cause === "string" && /^[A-Z0-9_]{2,40}$/.test(cause) ? cause : "NETWORK";
    throw new SelsynError("PROVIDER_UNREACHABLE", `Não foi possível conectar ao servidor Selsyn (${net}). Verifique se o acesso está liberado para o servidor LOCAKAR.`, 503);
  }
}

export interface CommandReceipt { id: string; status: string | null; returnedAt: string | null; deviceId: string | null }
/** PUT físico isolado do catálogo GET. Sem retry: timeout pode ter sido entregue. */
export async function sendSelsynCommand(action: "lock" | "unlock", identifier: string, imei: string, key: string, send: typeof fetch = fetch): Promise<CommandReceipt> {
  if (action !== "lock" && action !== "unlock") throw new SelsynError("INVALID_INPUT", "Comando não permitido.");
  if (!/^[A-Z0-9]{5,10}$/.test(identifier) || !validImei(imei)) throw new SelsynError("INVALID_INPUT", "Placa ou IMEI inválidos.");
  if (!key || /[\s"']/.test(key)) throw new SelsynError("NOT_CONFIGURED", "Credencial Selsyn inválida ou ausente.", 503);
  const url = new URL(`v1/integracao/gdr/${action === "lock" ? "bloqueio" : "desbloqueio"}/${identifier}/${imei}`, SELSYN_BASE);
  try {
    const res = await send(url, { method: "PUT", headers: { Accept: "application/json", "x-api-key": key }, signal: AbortSignal.timeout(15000), redirect: "error", cache: "no-store" });
    const reader = res.body?.getReader(); const parts: Uint8Array[] = []; let length = 0;
    if (reader) while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 32000) { await reader.cancel(); throw new SelsynError("COMMAND_UNCERTAIN", "Resposta do comando excedeu o limite. Não repita; confira com a Selsyn.", 424); }
      parts.push(value);
    }
    if (!res.ok) throw providerError(res.status);
    let raw: Record<string, unknown>;
    try { raw = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new SelsynError("COMMAND_UNCERTAIN", "Resposta do comando inválida. Não repita; confira com a Selsyn.", 424); }
    const id = typeof raw?.id === "number" && Number.isSafeInteger(raw.id) ? String(raw.id) : typeof raw?.id === "string" && /^\d+$/.test(raw.id) ? raw.id : null;
    if (!id) throw new SelsynError("COMMAND_UNCERTAIN", "A Selsyn não confirmou o identificador do comando. Não repita.", 424);
    const status = raw.status && typeof raw.status === "object" ? (raw.status as { key?: unknown }).key : null;
    return { id, status: typeof status === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(status) && !status.includes(key) ? status : null, returnedAt: typeof raw.returnDate === "string" && Number.isFinite(Date.parse(raw.returnDate)) ? raw.returnDate : null, deviceId: typeof raw.deviceId === "number" && Number.isSafeInteger(raw.deviceId) && raw.deviceId > 0 ? String(raw.deviceId) : typeof raw.deviceId === "string" && /^[1-9]\d{0,18}$/.test(raw.deviceId) ? raw.deviceId : null };
  } catch (e) {
    if (e instanceof SelsynError) throw e;
    throw new SelsynError("COMMAND_UNCERTAIN", "O comando pode ter sido entregue, mas não houve confirmação. Não repita; confira com a Selsyn.", 504);
  }
}


/** Consulta autenticada por TOKEN, não API Key. Nunca faz login nem dispara PUT como fallback. */
export async function getSelsynCommandExecution(trackableId: string, deviceId: string, action: "lock" | "unlock", token: string, send: typeof fetch = fetch): Promise<CommandExecution> {
  if (!token) throw new SelsynError("TOKEN_REQUIRED", "Configure SELSYN_ACCESS_TOKEN no servidor com um token Selsyn autorizado. A API Key não substitui esse token.", 409);
  if (/[\r\n]/.test(token) || token.trim() !== token) throw new SelsynError("INVALID_TOKEN_FORMAT", "Token contém espaços externos ou quebra de linha.", 409);
  if (![trackableId, deviceId].every(v => /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= BigInt("9223372036854775807")) || !["lock","unlock"].includes(action)) throw new SelsynError("INVALID_INPUT", "Identificação inválida para consulta do comando.");
  const type = action === "lock" ? "LOCK" : "UNLOCK";
  const url = new URL(`intervencao/comando/${trackableId}/${deviceId}/${type}`, SELSYN_BASE);
  try {
    const res = await send(url, { method: "GET", headers: { Accept: "application/json", "x-r2f-auth": token }, signal: AbortSignal.timeout(12000), redirect: "error", cache: "no-store" });
    const reader = res.body?.getReader(); const parts: Uint8Array[] = []; let length = 0;
    if (reader) while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 32000) { await reader.cancel(); throw new SelsynError("RESPONSE_TOO_LARGE", "Resposta de execução excedeu o limite. Comando não alterado.", 424); }
      parts.push(value);
    }
    if (res.status === 401 || res.status === 403) throw new SelsynError("TOKEN_AUTH_FAILED", "A Selsyn recusou o token de consulta de execução. Confira validade e permissão; nenhum comando foi reenviado.", 424, res.status);
    if (!res.ok) throw providerError(res.status);
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { throw new SelsynError("INVALID_PROVIDER_RESPONSE", "Resposta de execução inválida. Registro pendente preservado.", 424); }
    const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
    const id = (v: unknown): string | null => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? String(v) : typeof v === "string" && /^[1-9]\d{0,18}$/.test(v) && BigInt(v) <= BigInt("9223372036854775807") ? v : null;
    const field = (v: unknown): string | null => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v) && !v.includes(token) ? v : null;
    const date = (v: unknown): string | null => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
    const c = obj(raw); const device = obj(c.dispositivo);
    const commandId = id(c.id);
    if (!commandId) throw new SelsynError("INVALID_PROVIDER_RESPONSE", "Identificador do comando ausente ou inválido.", 424);
    return { id: commandId, deviceId: id(c.deviceId), imei: id(device.identificador), trackableId: id(obj(device.rastreavel).key), type: field(obj(c.type).key), status: field(obj(c.status).key), sentAt: date(c.sendDate), returnedAt: date(c.returnDate), result: typeof c.result === "string" ? String(sanitizeSelsyn(c.result, token)).slice(0, 300) : null };
  } catch (e) {
    if (e instanceof SelsynError) throw e;
    throw new SelsynError("COMMAND_CHECK_UNAVAILABLE", "Não foi possível consultar a execução. Comando pendente preservado; não repetir.", 503);
  }
}
