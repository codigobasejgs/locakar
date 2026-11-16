import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Comparação em tempo constante de dois hex. */
function sameHex(a: string, b: string) {
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/**
 * Mercado Pago (x-signature: "ts=<seg>,v1=<hex>"). Manifesto igual ao SDK oficial:
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (par ausente é omitido), HMAC-SHA256 com a assinatura secreta.
 */
export function verifyMercadoPago(p: { xSignature: string | null; xRequestId: string | null; dataId: string | null; secret: string; now?: number; toleranceSeconds?: number }) {
  if (!p.xSignature || !p.secret) return false;
  let ts = "";
  let v1 = "";
  for (const part of p.xSignature.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim();
    if (k === "ts") ts = v;
    if (k === "v1") v1 = v;
  }
  if (!/^\d+$/.test(ts) || !v1) return false;
  const parts = [p.dataId?.trim() ? `id:${p.dataId.trim()}` : null, p.xRequestId?.trim() ? `request-id:${p.xRequestId.trim()}` : null, `ts:${ts}`].filter(Boolean);
  const manifest = `${parts.join(";")};`;
  if (!sameHex(createHmac("sha256", p.secret).update(manifest).digest("hex"), v1)) return false;
  // ts vem em milissegundos nos exemplos atuais e em segundos no SDK: aceita os dois.
  const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  return p.toleranceSeconds == null || Math.abs((p.now ?? Date.now()) - tsMs) / 1000 <= p.toleranceSeconds;
}

/** PagBank (x-authenticity-token): sha256("<token>-<corpo cru>"), o corpo exatamente como chegou. */
export function verifyPagBank(rawBody: string, token: string, header: string | null) {
  if (!header || !token) return false;
  return sameHex(createHash("sha256").update(`${token}-${rawBody}`, "utf8").digest("hex"), header.trim());
}

/** Token aleatório de URL (Pagar.me) comparado pelo hash guardado. */
export const sha256Hex = (v: string) => createHash("sha256").update(v).digest("hex");
export const sameTokenHash = (token: string, hash: string | null | undefined) => Boolean(hash) && sameHex(sha256Hex(token), hash!);
