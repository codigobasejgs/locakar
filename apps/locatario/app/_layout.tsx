import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LocatarioProvider } from "../context/LocatarioProvider";
import { Colors } from "../constants/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LocatarioProvider>
        <StatusBar style="light" backgroundColor={Colors.background} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: "fade",
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </LocatarioProvider>
    </SafeAreaProvider>
  );
}
