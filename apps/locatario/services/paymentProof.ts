import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

export interface UploadProofResult {
  success: boolean;
  proofUrl?: string;
  error?: string;
}

/**
 * Permite ao locatário tirar foto do comprovante ou escolher da galeria,
 * enviando para o bucket privado 'comprovantes' no Supabase Storage.
 */
export async function pickProofImage(source: "camera" | "gallery"): Promise<string | null> {
  if (source === "camera") {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Permissão para usar a câmera é necessária para fotografar o comprovante.");
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      return result.assets[0].uri;
    }
  } else {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      throw new Error("Permissão para acessar a galeria é necessária para anexar o comprovante.");
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      return result.assets[0].uri;
    }
  }
  return null;
}

export async function uploadPaymentProof(
  clientId: string,
  rentalId: string,
  receiptId: string,
  imageUri: string,
  amount: number
): Promise<UploadProofResult> {
  try {
    const fileExt = imageUri.split(".").pop() || "jpg";
    const fileName = `${clientId}/${rentalId}_${receiptId}_${Date.now()}.${fileExt}`;

    // Leitura do arquivo como blob/arrayBuffer
    const response = await fetch(imageUri);
    const blob = await response.blob();
    const arrayBuffer = await new Response(blob).arrayBuffer();

    // Upload no bucket privado comprovantes
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("comprovantes")
      .upload(fileName, arrayBuffer, {
        contentType: `image/${fileExt === "png" ? "png" : "jpeg"}`,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Falha no upload do comprovante: ${uploadError.message}`);
    }

    // Registra na tabela payment_receipts
    const { error: dbError } = await supabase.from("payment_receipts").insert({
      client_id: clientId,
      rental_id: rentalId,
      receipt_id: receiptId,
      amount,
      proof_url: uploadData.path,
      status: "pending_review",
      payment_date: new Date().toISOString().slice(0, 10),
    });

    if (dbError) {
      throw new Error(`Erro ao registrar comprovante: ${dbError.message}`);
    }

    return { success: true, proofUrl: uploadData.path };
  } catch (e: any) {
    return { success: false, error: e.message || "Erro desconhecido" };
  }
}
