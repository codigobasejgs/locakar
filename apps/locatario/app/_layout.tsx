import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Colors } from "../constants/theme";
import { LocatarioProvider } from "../context/LocatarioProvider";
import { useLocatario } from "../hooks/useLocatario";

/** Leva cada estado para a tela certa: login, conta não vinculada ou o app. */
function Gate() {
  const { state } = useLocatario();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (state === "loading") return;
    const group = segments[0];
    const inAuth = group === "(auth)";
    if (state === "signed-out" && !inAuth) router.replace("/(auth)/login");
    else if (state === "unlinked" && segments.join("/") !== "(auth)/vincular") router.replace("/(auth)/vincular");
    else if (state === "ready" && (inAuth || !group)) router.replace("/(tabs)/inicio");
  }, [state, segments, router]);

  if (state === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.brandSoft} size="large" accessibilityLabel="Carregando" />
      </View>
    );
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background }, animation: "fade" }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
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
