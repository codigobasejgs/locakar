import React from "react";
import { ActivityIndicator, GestureResponderEvent, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Radius, Spacing } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";

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

/** Botão com área de toque confortável, adaptado dinamicamente ao tema ativo. */
export function Button({ label, variant = "primary", size = "md", loading = false, disabled = false, icon, style, onPress }: ButtonProps) {
  const { colors, isDark } = useTheme();
  const off = disabled || loading;
  const gradient = variant === "primary" && !disabled;

  const content = loading ? (
    <ActivityIndicator color={variant === "primary" ? "#FFFFFF" : colors.text} size="small" />
  ) : (
    <>
      {icon}
      <Text
        style={[
          styles.text,
          styles[`text_${size}`],
          { color: variant === "primary" ? "#FFFFFF" : variant === "danger" ? colors.danger : colors.text },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </>
  );

  const variantStyle: ViewStyle =
    variant === "secondary"
      ? { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1 }
      : variant === "outline"
      ? { backgroundColor: "transparent", borderColor: colors.borderStrong, borderWidth: 1 }
      : variant === "danger"
      ? { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1 }
      : variant === "ghost"
      ? { backgroundColor: "transparent" }
      : { backgroundColor: colors.brandDeep };

  return (
    <Pressable
      disabled={off}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed, hovered, focused }: State) => [
        styles.base,
        !gradient && [styles.row, styles[`size_${size}`], variantStyle],
        hovered && !off && (gradient ? styles.hoverPrimary : { backgroundColor: colors.surfaceHover }),
        focused && { borderColor: colors.brandSoft, borderWidth: 1 },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      {gradient ? (
        <LinearGradient
          colors={isDark ? [colors.brand, colors.magenta] : [colors.brandDeep, colors.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.row, styles[`size_${size}`]]}
        >
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
  hoverPrimary: { opacity: 0.92 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
  text: { fontWeight: "600", textAlign: "center", flexShrink: 1 },
  text_sm: { fontSize: 13 },
  text_md: { fontSize: 15 },
  text_lg: { fontSize: 16 },
  disabled: { opacity: 0.45 },
});
