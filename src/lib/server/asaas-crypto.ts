import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Segredos do Asaas no banco: AES-256-GCM com chave mestra só no ambiente (ASAAS_ENCRYPTION_KEY, 32 bytes base64/hex).
 * O banco guarda "v1:<iv>:<tag>:<cifra>"; sem a variável de ambiente ninguém (nem o painel) consegue decifrar.
 */
function masterKey(): Buffer {
  const raw = process.env.ASAAS_ENCRYPTION_KEY?.trim() ?? "";
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Configure ASAAS_ENCRYPTION_KEY (32 bytes em base64) no servidor.");
  return key;
}
export const hasMasterKey = () => {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
};

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo Asaas em formato inválido.");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Token do webhook: 48 caracteres aleatórios (docs: 32–255, sem espaços, não pode ser a API Key). Guardamos só o hash. */
export const newWebhookToken = () => randomBytes(36).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function sameHash(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
