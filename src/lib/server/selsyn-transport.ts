import "server-only";
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
