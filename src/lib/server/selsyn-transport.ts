import "server-only";
import { buildSelsynRequest, providerError, sanitizeSelsyn, SELSYN_BASE, SelsynError, validateSelsynResponse, type Json } from "../selsyn";

export interface SelsynFile { name: string; mime: string; base64: string }
/** Transporte único, testável com fetch simulado; não registra URLs que contenham a credencial. */
export async function fetchSelsyn(operationId: string, input: Record<string, unknown>, key: string, send: typeof fetch = fetch): Promise<{ data: Json; file?: SelsynFile }> {
  if (!key) throw new SelsynError("NOT_CONFIGURED", "Configure SELSYN_API_KEY no backend para consultar.", 503);
  const { path, query } = buildSelsynRequest(operationId, input);
  const url = new URL(path.replace(/^\//, ""), SELSYN_BASE);
  url.search = query.toString();
  url.searchParams.set("x-api-key", key);
  try {
    const res = await send(url, { method: "GET", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store" });
    if (!res.ok) throw providerError(res.status);
    if (Number(res.headers.get("content-length")) > 8 * 1024 * 1024) throw new SelsynError("RESPONSE_TOO_LARGE", "Consulta muito grande. Reduza o período ou o tamanho da página.", 502);
    const reader = res.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 8 * 1024 * 1024) { await reader.cancel(); throw new SelsynError("RESPONSE_TOO_LARGE", "Consulta muito grande. Reduza o período.", 502); }
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
      if (body.includes(Buffer.from(key)) || body.includes(Buffer.from(encodeURIComponent(key)))) throw new SelsynError("UNSAFE_EXPORT", "A exportação contém referência sensível e não pode ser entregue.", 502);
      return { data: null, file: { name: `selsyn-${operationId}.${extension}`, mime: mime!, base64: body.toString("base64") } };
    }
    let raw: unknown;
    try { raw = body.toString("utf8").trim() ? JSON.parse(body.toString("utf8")) : null; } catch { throw new SelsynError("INVALID_PROVIDER_RESPONSE", "A Selsyn retornou um formato não documentado para esta consulta/exportação.", 502); }
    return { data: sanitizeSelsyn(validateSelsynResponse(operationId, raw), key) };
  } catch (e) {
    if (e instanceof SelsynError) throw e;
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new SelsynError("TIMEOUT", "A Selsyn demorou para responder. Não houve nova tentativa automática.", 504);
    throw new SelsynError("PROVIDER_ERROR", "Não foi possível conectar à Selsyn.", 502);
  }
}
