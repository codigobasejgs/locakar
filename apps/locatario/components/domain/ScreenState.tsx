import { CircleAlert } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { Radius, Spacing, Type } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { Button } from "../ui/Button";

/** Aviso de erro no topo da tela, sem esconder o que já estava carregado. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.banner,
        {
          borderColor: colors.dangerBorder,
          backgroundColor: colors.dangerSoft,
        },
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.row}>
        <CircleAlert color={colors.danger} size={18} />
        <Text style={[styles.text, { color: colors.text }]}>{message}</Text>
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
  },
  row: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start" },
  text: { ...Type.small, flex: 1 },
});
