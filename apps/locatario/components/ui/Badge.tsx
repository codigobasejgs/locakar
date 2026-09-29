import { StyleSheet, Text, View } from "react-native";
import { Radius, Spacing } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

/** Status com ponto + texto adaptado dinamicamente ao tema ativo. */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const { colors } = useTheme();

  const config =
    tone === "success"
      ? { bg: colors.successSoft, fg: colors.success, border: colors.successBorder }
      : tone === "warning"
      ? { bg: colors.warningSoft, fg: colors.warning, border: colors.warningBorder }
      : tone === "danger"
      ? { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerBorder }
      : tone === "info"
      ? { bg: colors.infoSoft, fg: colors.info, border: colors.infoBorder }
      : tone === "brand"
      ? { bg: colors.brandTint, fg: colors.brandSoft, border: colors.brandBorder }
      : { bg: colors.surfaceHover, fg: colors.textMuted, border: colors.border };

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.border }]} accessibilityLabel={`Status: ${label}`}>
      <View style={[styles.dot, { backgroundColor: config.fg }]} />
      <Text style={[styles.text, { color: config.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.s12 - 2,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
    flexShrink: 0,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, lineHeight: 14, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
});
