import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { encrypt, decrypt, hasSecretKey } from "./secret";

/**
 * Segredos do Asaas no banco: AES-256-GCM com chave mestra só no ambiente (ASAAS_ENCRYPTION_KEY, 32 bytes base64/hex).
 * O banco guarda "v1:<iv>:<tag>:<cifra>"; sem a variável de ambiente ninguém (nem o painel) consegue decifrar.
 */
export const hasMasterKey = () => hasSecretKey("ASAAS_ENCRYPTION_KEY");
export const encryptSecret = (plain: string) => encrypt(plain, "ASAAS_ENCRYPTION_KEY");
export const decryptSecret = (stored: string) => decrypt(stored, "ASAAS_ENCRYPTION_KEY");

/** Token do webhook: 48 caracteres aleatórios (docs: 32–255, sem espaços, não pode ser a API Key). Guardamos só o hash. */
export const newWebhookToken = () => randomBytes(36).toString("base64url");
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export function sameHash(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
