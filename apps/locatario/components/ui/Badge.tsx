import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors, Radius, Spacing } from "../../constants/theme";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  return (
    <View style={[styles.badge, styles[`tone_${tone}`]]}>
      <Text style={[styles.text, styles[`text_${tone}`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tone_success: { backgroundColor: Colors.successSoft },
  text_success: { color: Colors.success },
  tone_warning: { backgroundColor: Colors.warningSoft },
  text_warning: { color: Colors.warning },
  tone_danger: { backgroundColor: Colors.dangerSoft },
  text_danger: { color: Colors.danger },
  tone_info: { backgroundColor: Colors.infoSoft },
  text_info: { color: Colors.info },
  tone_brand: { backgroundColor: "rgba(160, 0, 160, 0.15)" },
  text_brand: { color: Colors.brandSoft },
  tone_neutral: { backgroundColor: "rgba(255, 255, 255, 0.06)" },
  text_neutral: { color: Colors.textMuted },
});
