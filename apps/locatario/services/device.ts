import * as AppIntegrity from "@expo/app-integrity";
import Constants from "expo-constants";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./api";
import { installationId } from "./cache";
import { newId } from "./upload";

/**
 * Registro do aparelho no servidor: push nativo (Expo → FCM/APNs) e sinais de segurança DECLARADOS
 * na tela de privacidade: modelo, sistema, versão do app, se é emulador e a verificação de integridade.
 * Não coleta localização, contatos, arquivos, apps instalados nem nada fora dessa lista.
 * O IP é visto pelo servidor; o score é calculado lá e nunca aparece aqui.
 */
const EAS_PROJECT_ID: string | undefined = Constants.expoConfig?.extra?.eas?.projectId;
// Número do projeto Google Cloud da Play Integrity (público, não é segredo). Vazio = verificação desligada.
const PLAY_CLOUD_PROJECT: string | undefined = Constants.expoConfig?.extra?.playIntegrityCloudProject;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function pushToken(ask: boolean): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice || !EAS_PROJECT_ID) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Avisos da LOCAKAR", importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data;
  } catch {
    return null; // Expo Go / sem Google Play: segue sem push
  }
}

async function integrity(id: string): Promise<{ integrityToken?: string; integrityTs?: number }> {
  if (Platform.OS !== "android" || !PLAY_CLOUD_PROJECT) return {};
  try {
    const ts = Date.now();
    const hash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${id}:${ts}`);
    await AppIntegrity.prepareIntegrityTokenProviderAsync(PLAY_CLOUD_PROJECT);
    return { integrityToken: await AppIntegrity.requestIntegrityCheckAsync(hash), integrityTs: ts };
  } catch {
    return {}; // sem Play Services: o servidor registra "não verificado", sem bloquear
  }
}

/** Chamado ao abrir o app (depois do aceite de privacidade). `askPush` só quando a pessoa aceitou notificações. */
export async function registerDevice(askPush: boolean) {
  const id = await installationId(newId);
  const [token, check] = await Promise.all([pushToken(askPush), integrity(id)]);
  return api<{ ok: true; push: boolean }>("/api/tenant/device", {
    method: "POST",
    body: {
      action: "register",
      installationId: id,
      platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web",
      pushToken: token,
      deviceModel: Device.modelName ?? undefined,
      osVersion: `${Device.osName ?? Platform.OS} ${Device.osVersion ?? ""}`.trim(),
      appVersion: Constants.expoConfig?.version,
      isEmulator: Platform.OS !== "web" && !Device.isDevice,
      ...check,
    },
  });
}

/** Logout: este aparelho para de receber push da conta. */
export async function unregisterDevice() {
  const id = await installationId(newId);
  await api("/api/tenant/device", { method: "POST", body: { action: "unregister", installationId: id } }).catch(() => {});
}

export const acceptPrivacy = (scopes: string[]) => api("/api/tenant/device", { method: "POST", body: { action: "consent", scopes } });
