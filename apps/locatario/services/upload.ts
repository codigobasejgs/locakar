import { randomUUID } from "expo-crypto";
import { SaveFormat, manipulateAsync } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

export class PermissionDenied extends Error {}

/** Abre a câmera ou a galeria. Retorna null se a pessoa cancelar. */
export async function pickImage(source: "camera" | "gallery"): Promise<string | null> {
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

/** Id aleatório para nomes de arquivo e idempotência dos envios (o servidor aceita [A-Za-z0-9_-]). */
export const newId = () => randomUUID().replace(/-/g, "");

/**
 * Comprime (JPEG até 1600px: legível e leve) e sobe para um bucket privado.
 * `upsert` permite reenviar a mesma foto após falha de rede sem erro de "já existe".
 */
export async function uploadImage(bucket: string, path: string, uri: string) {
  const image = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.7, format: SaveFormat.JPEG });
  const body = await (await fetch(image.uri)).arrayBuffer();
  if (body.byteLength > 7 * 1024 * 1024) throw new Error("A imagem ficou grande demais. Tente uma foto mais próxima.");
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error("Não foi possível enviar a imagem. Verifique a internet e tente de novo.");
  return path;
}
