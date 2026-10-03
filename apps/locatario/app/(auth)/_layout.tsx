import { Stack } from "expo-router";
import { useTheme } from "../../context/ThemeProvider";

export default function AuthLayout() {
  const { colors: Colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    />
  );
}
