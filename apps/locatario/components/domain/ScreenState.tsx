import { CircleAlert } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Colors, Radius, Spacing, Type } from "../../constants/theme";
import { Button } from "../ui/Button";

/** Aviso de erro no topo da tela (ex.: sem internet), sem esconder o que já estava carregado. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={styles.row}>
        <CircleAlert color={Colors.danger} size={18} />
        <Text style={styles.text}>{message}</Text>
      </View>
      <Button label="Tentar novamente" size="sm" variant="outline" onPress={onRetry} style={{ alignSelf: "flex-start" }} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: Spacing.s12,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.3)",
    backgroundColor: Colors.dangerSoft,
  },
  row: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start" },
  text: { ...Type.small, color: Colors.text, flex: 1 },
});
