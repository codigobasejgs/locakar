import React from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Radius, Spacing } from "../../constants/theme";

interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (event: GestureResponderEvent) => void;
}

type State = { pressed: boolean; hovered?: boolean; focused?: boolean };

/** Botão com área de toque ≥ 40–52px, hover (web), pressed discreto e foco visível. */
export function Button({ label, variant = "primary", size = "md", loading = false, disabled = false, icon, style, onPress }: ButtonProps) {
  const off = disabled || loading;
  const gradient = variant === "primary" && !disabled;

  const content = loading ? (
    <ActivityIndicator color={Colors.text} size="small" />
  ) : (
    <>
      {icon}
      <Text style={[styles.text, styles[`text_${size}`], variant === "danger" && { color: Colors.danger }]} numberOfLines={2}>
        {label}
      </Text>
    </>
  );

  return (
    <Pressable
      disabled={off}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed, hovered, focused }: State) => [
        styles.base,
        !gradient && [styles.row, styles[`size_${size}`], styles[`variant_${variant}`]],
        hovered && !off && (gradient ? styles.hoverPrimary : styles.hover),
        focused && styles.focus,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {gradient ? (
        <LinearGradient colors={[Colors.brand, Colors.magenta]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.row, styles[`size_${size}`]]}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.md, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm },
  size_sm: { minHeight: 40, paddingVertical: 8, paddingHorizontal: 14 },
  size_md: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 20 },
  size_lg: { minHeight: 52, paddingVertical: 14, paddingHorizontal: 24 },
  variant_secondary: { backgroundColor: Colors.surfaceElevated, borderColor: Colors.border, borderWidth: 1 },
  variant_outline: { backgroundColor: "transparent", borderColor: Colors.borderStrong, borderWidth: 1 },
  // Primário desabilitado cai no visual sólido (sem gradiente).
  variant_primary: { backgroundColor: Colors.brandDeep },
  variant_ghost: { backgroundColor: "transparent" },
  variant_danger: { backgroundColor: Colors.dangerSoft, borderColor: "rgba(248, 113, 113, 0.35)", borderWidth: 1 },
  hover: { backgroundColor: Colors.surfaceHover },
  hoverPrimary: { opacity: 0.92 },
  focus: { borderColor: Colors.brandSoft, borderWidth: 1 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
  text: { color: Colors.text, fontWeight: "600", textAlign: "center", flexShrink: 1 },
  text_sm: { fontSize: 13 },
  text_md: { fontSize: 15 },
  text_lg: { fontSize: 16 },
  disabled: { opacity: 0.45 },
});
