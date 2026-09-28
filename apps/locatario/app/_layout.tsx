import { Stack, useRouter, useSegments, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBanner } from "../components/domain/ScreenState";
import { Colors } from "../constants/theme";
import { LocatarioProvider } from "../context/LocatarioProvider";
import { useLocatario } from "../hooks/useLocatario";
import { clearNotificationResponse, useNotificationResponse } from "../hooks/useNotificationResponse";

/**
 * Destino ao tocar numa notificação (data.screen, definido pelo servidor em lib/server/push.ts).
 * Lista fechada: um valor desconhecido abre o início. O mesmo vale para links locakar://<tela>.
 */
const SCREENS: Record<string, Href> = {
  inicio: "/(tabs)/inicio",
  pagamentos: "/(tabs)/pagamentos",
  locacao: "/(tabs)/locacao",
  veiculo: "/veiculo",
  ocorrencias: "/ocorrencias",
  documentos: "/documentos",
  multas: "/multas",
  reservas: "/reservas",
};

/** Leva cada estado para a tela certa: login, conta não vinculada, privacidade ou o app. */
function Gate() {
  const { state, summary, error, refresh } = useLocatario();
  const segments = useSegments();
  const router = useRouter();
  const needsConsent = state === "ready" && summary != null && !summary.consent;

  useEffect(() => {
    if (state === "loading" || state === "error") return;
    const group = segments[0] as string | undefined;
    const inAuth = group === "(auth)";
    if (state === "signed-out" && !inAuth) router.replace("/(auth)/login");
    else if (state === "unlinked" && segments.join("/") !== "(auth)/vincular") router.replace("/(auth)/vincular");
    else if (needsConsent && group !== "privacidade") router.replace("/privacidade");
    else if (state === "ready" && !needsConsent && (inAuth || !group)) router.replace("/(tabs)/inicio");
  }, [state, needsConsent, segments, router]);

  // Toque na notificação (app aberto, em segundo plano ou fechado). No web é noop.
  const response = useNotificationResponse();
  useEffect(() => {
    if (Platform.OS === "web" || state !== "ready" || needsConsent || !response) return;
    const screen = response.notification.request.content.data?.screen;
    router.push(SCREENS[typeof screen === "string" ? screen : ""] ?? SCREENS.inicio);
    clearNotificationResponse();
  }, [response, state, needsConsent, router]);

  if (state === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.brandSoft} size="large" accessibilityLabel="Carregando" />
      </View>
    );
  }
  if (state === "error") {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: Colors.background }}>
        <ErrorBanner message={error ?? "Sem conexão."} onRetry={refresh} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: "fade",
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="privacidade" options={{ headerShown: !needsConsent, title: "Privacidade", animation: "slide_from_right" }} />
      <Stack.Screen name="vistoria" options={{ headerShown: true, title: "Vistoria", animation: "slide_from_right" }} />
      <Stack.Screen name="veiculo" options={{ headerShown: true, title: "Meu veículo", animation: "slide_from_right" }} />
      <Stack.Screen name="ocorrencias" options={{ headerShown: true, title: "Ocorrências", animation: "slide_from_right" }} />
      <Stack.Screen name="documentos" options={{ headerShown: true, title: "Documentos", animation: "slide_from_right" }} />
      <Stack.Screen name="multas" options={{ headerShown: true, title: "Multas", animation: "slide_from_right" }} />
      <Stack.Screen name="reservas" options={{ headerShown: true, title: "Reservas", animation: "slide_from_right" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocatarioProvider>
        <StatusBar style="light" />
        <Gate />
      </LocatarioProvider>
    </SafeAreaProvider>
  );
}
