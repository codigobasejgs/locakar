import * as DocumentPicker from "expo-document-picker";
import { api } from "./api";
import { supabase } from "./supabase";
import { uploadImage } from "./upload";

export { PermissionDenied, pickImage as pickProofImage } from "./upload";

export async function pickProofFile(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"], copyToCacheDirectory: true });
  if (r.canceled) return null;
  const f = r.assets[0];
  if ((f.size ?? 0) > 7 * 1024 * 1024) throw new Error("O comprovante deve ter no máximo 7 MB.");
  return f.mimeType === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") ? `pdf:${f.uri}` : f.uri;
}

/** Bucket privado existente: imagem comprimida em JPEG ou PDF original, limite 7 MB. */
export async function sendPaymentProof(args: { clientId: string; rentalId: string; installmentId: string; imageUri: string }) {
  const pdf = args.imageUri.startsWith("pdf:");
  let path = `${args.clientId}/${args.rentalId}_${args.installmentId}_${Date.now()}.${pdf ? "pdf" : "jpg"}`;
  if (pdf) {
    const body = await (await fetch(args.imageUri.slice(4))).arrayBuffer();
    if (body.byteLength > 7 * 1024 * 1024 || new TextDecoder().decode(body.slice(0, 5)) !== "%PDF-") throw new Error("Arquivo PDF inválido ou maior que 7 MB.");
    const { error } = await supabase.storage.from("comprovantes").upload(path, body, { contentType: "application/pdf" });
    if (error) throw new Error("Não foi possível enviar o PDF. Verifique a internet e tente novamente.");
  } else path = await uploadImage("comprovantes", path, args.imageUri);
  return api<{ ok: true; amount: number }>("/api/tenant/receipts", { method: "POST", body: { rentalId: args.rentalId, receiptId: args.installmentId, proofPath: path } });
}
