import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(variable: string): Buffer {
  const raw = process.env[variable]?.trim() ?? "";
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error(`Configure ${variable} (32 bytes em base64) no servidor.`);
  return k;
}
export function hasSecretKey(variable: string) { try { key(variable); return true; } catch { return false; } }
export function encrypt(plain: string, variable: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(variable), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}
export function decrypt(stored: string, variable: string): string {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato inválido.");
  const d = createDecipheriv("aes-256-gcm", key(variable), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
