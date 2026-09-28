import { SaveFormat, manipulateAsync } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { api } from "./api";
import { supabase } from "./supabase";

export class PermissionDenied extends Error {}

/** Abre a câmera ou a galeria. Retorna null se a pessoa cancelar. */
export async function pickProofImage(source: "camera" | "gallery"): Promise<string | null> {
  const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new PermissionDenied(
      source === "camera"
        ? "Sem acesso à câmera. Libere nas configurações do celular ou escolha uma imagem da galeria."
        : "Sem acesso à galeria. Libere nas configurações do celular ou tire uma foto.",
    );
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

/**
 * Envia o comprovante: comprime (JPEG até 1600px, legível e leve), sobe para a pasta do cliente no bucket
 * privado e pede ao servidor para registrar. O valor é calculado pelo servidor.
 */
export async function sendPaymentProof(args: { clientId: string; rentalId: string; installmentId: string; imageUri: string }) {
  const image = await manipulateAsync(args.imageUri, [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG });
  const body = await (await fetch(image.uri)).arrayBuffer();
  if (body.byteLength > 5 * 1024 * 1024) throw new Error("A imagem ficou grande demais. Tente uma foto mais próxima do comprovante.");

  const path = `${args.clientId}/${args.rentalId}_${args.installmentId}_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from("comprovantes").upload(path, body, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error("Não foi possível enviar a imagem. Verifique a internet e tente de novo.");

  return api<{ ok: true; amount: number }>("/api/tenant/receipts", {
    method: "POST",
    body: { rentalId: args.rentalId, receiptId: args.installmentId, proofPath: path },
  });
}
