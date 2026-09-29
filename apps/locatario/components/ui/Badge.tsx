import { StyleSheet, Text, View } from "react-native";
import { Colors, Radius, Spacing } from "../../constants/theme";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

const TONE: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
  success: { bg: Colors.successSoft, fg: Colors.success, border: "rgba(52, 211, 153, 0.25)" },
  warning: { bg: Colors.warningSoft, fg: Colors.warning, border: "rgba(251, 191, 36, 0.25)" },
  danger: { bg: Colors.dangerSoft, fg: Colors.danger, border: "rgba(248, 113, 113, 0.25)" },
  info: { bg: Colors.infoSoft, fg: Colors.info, border: "rgba(96, 165, 250, 0.25)" },
  brand: { bg: Colors.brandTint, fg: Colors.brandSoft, border: Colors.brandBorder },
  neutral: { bg: "rgba(255, 255, 255, 0.05)", fg: Colors.textMuted, border: Colors.border },
};

/** Status com ponto + texto (nunca só cor): fundo translúcido, borda suave. */
export function Badge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  const t = TONE[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg, borderColor: t.border }]} accessibilityLabel={`Status: ${label}`}>
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
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
