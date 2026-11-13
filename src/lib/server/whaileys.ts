import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cliente do motor Whaileys (services/whaileys-api). Chaves só no servidor:
 * WHAILEYS_API_URL, WHAILEYS_API_KEY e WHAILEYS_WEBHOOK_SECRET. Independente da Evolution API.
 */
export const isWhaileysEnabled = () => Boolean(process.env.WHAILEYS_API_URL && process.env.WHAILEYS_API_KEY && process.env.WHAILEYS_WEBHOOK_SECRET);
export const instanceKeyFor = (orgId: string) => `locakar_copilot_${orgId}`;

export interface WhaileysStatus { state: "open" | "connecting" | "closed" | "disconnected"; qr: string | null; pairingCode: string | null; me: { id: string | null; lid: string | null } | null }
export interface OutgoingCard { text: string; buttons?: { id: string; title: string }[]; sections?: { title: string; rows: { id: string; title: string; description?: string }[] }[]; buttonText?: string }

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env.WHAILEYS_API_URL!.replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "x-api-key": process.env.WHAILEYS_API_KEY!, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Motor do Copiloto indisponível (HTTP ${res.status}).`);
  return json;
}

export const whaileysStatus = (key: string) => call<WhaileysStatus>(`/sessions/${key}`);
export const whaileysConnect = (key: string, phone?: string) => call<WhaileysStatus>(`/sessions/${key}/connect`, { method: "POST", body: JSON.stringify(phone ? { phone } : {}) });
export const whaileysLogout = (key: string) => call<{ ok: boolean }>(`/sessions/${key}`, { method: "DELETE" });
export const whaileysSend = (key: string, to: string, card: OutgoingCard) => call<{ messageId: string }>(`/sessions/${key}/send`, { method: "POST", body: JSON.stringify({ to, ...card }) });

/** Assinatura do webhook: HMAC-SHA256 de `${timestamp}.${corpo}`, janela de 5 minutos. */
export function verifyWhaileysSignature(raw: string, timestamp: string | null, signature: string | null, secret = process.env.WHAILEYS_WEBHOOK_SECRET ?? "", now = Date.now()) {
  if (!secret || !timestamp || !signature || !/^\d{13}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return false;
  if (Math.abs(now - Number(timestamp)) > 300_000) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
