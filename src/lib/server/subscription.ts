import "server-only";
import { HttpError } from "./supabase";

const b64url = /^[A-Za-z0-9_-]+={0,2}$/;

/** Valida a inscrição Web Push vinda do navegador (endpoint https + chaves base64url). */
export function parseSubscription(input: unknown) {
  const s = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = typeof s?.endpoint === "string" ? s.endpoint : "";
  const p256dh = typeof s?.keys?.p256dh === "string" ? s.keys.p256dh : "";
  const auth = typeof s?.keys?.auth === "string" ? s.keys.auth : "";
  let url: URL | null = null;
  try {
    url = new URL(endpoint);
  } catch {
    /* inválido abaixo */
  }
  if (!url || url.protocol !== "https:" || endpoint.length > 1000) throw new HttpError(422, "Inscrição inválida (endpoint).");
  if (!b64url.test(p256dh) || p256dh.length < 40 || p256dh.length > 200) throw new HttpError(422, "Inscrição inválida (p256dh).");
  if (!b64url.test(auth) || auth.length < 10 || auth.length > 100) throw new HttpError(422, "Inscrição inválida (auth).");
  return { endpoint, p256dh, auth };
}

