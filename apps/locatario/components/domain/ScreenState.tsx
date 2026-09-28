import { StyleSheet, Text, View } from "react-native";
import { Colors, Spacing } from "../../constants/theme";
import { Button } from "../ui/Button";

/** Aviso de erro no topo da tela (ex.: sem internet), sem esconder o que já estava carregado. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerText}>{message}</Text>
      <Button label="Tentar de novo" size="sm" variant="outline" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.danger,
    backgroundColor: Colors.dangerSoft,
  },
  bannerText: { color: Colors.text, fontSize: 14 },
});
