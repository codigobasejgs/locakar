import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
  StyleProp,
  GestureResponderEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Radius, Spacing } from "../../constants/theme";

interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (event: GestureResponderEvent) => void;
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  icon,
  style,
  onPress,
}: ButtonProps) {
  const isPrimary = variant === "primary";

  const content = (
    <>
      {loading ? (
        <ActivityIndicator color={Colors.text} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, styles[`text_${size}`]]}>{label}</Text>
        </>
      )}
    </>
  );

  if (isPrimary && !disabled) {
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        disabled={loading}
        onPress={onPress}
        style={[styles.base, style]}
      >
        <LinearGradient
          colors={[Colors.brand, Colors.magenta]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.gradient, styles[`size_${size}`]]}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.base,
        styles.solid,
        styles[`variant_${variant}`],
        styles[`size_${size}`],
        disabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  solid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  size_sm: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  size_md: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  size_lg: {
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  variant_secondary: {
    backgroundColor: Colors.surfaceHover,
    borderColor: Colors.border,
    borderWidth: 1,
  },
  variant_outline: {
    backgroundColor: "transparent",
    borderColor: Colors.borderStrong,
    borderWidth: 1,
  },
  variant_danger: {
    backgroundColor: Colors.dangerSoft,
    borderColor: Colors.danger,
    borderWidth: 1,
  },
  text: {
    color: Colors.text,
    fontWeight: "600",
  },
  text_sm: {
    fontSize: 13,
  },
  text_md: {
    fontSize: 15,
  },
  text_lg: {
    fontSize: 17,
  },
  disabled: {
    opacity: 0.5,
  },
});
