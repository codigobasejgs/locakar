import { api } from "./api";
import { uploadImage } from "./upload";

export { PermissionDenied, pickImage as pickProofImage } from "./upload";

/** Envia o comprovante para a pasta do cliente no bucket privado e pede ao servidor para registrar. O valor é calculado pelo servidor. */
export async function sendPaymentProof(args: { clientId: string; rentalId: string; installmentId: string; imageUri: string }) {
  const path = await uploadImage("comprovantes", `${args.clientId}/${args.rentalId}_${args.installmentId}_${Date.now()}.jpg`, args.imageUri);
  return api<{ ok: true; amount: number }>("/api/tenant/receipts", {
    method: "POST",
    body: { rentalId: args.rentalId, receiptId: args.installmentId, proofPath: path },
  });
}
