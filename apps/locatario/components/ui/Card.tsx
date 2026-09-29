import React from "react";
import { GestureResponderEvent, Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Colors, Radius, Shadow, Spacing } from "../../constants/theme";

interface CardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (event: GestureResponderEvent) => void;
  /** Destaque da marca (card principal). */
  accent?: boolean;
  accessibilityLabel?: string;
}

/** Superfície padrão. Clicável ganha hover (web), pressed e foco visível. */
export function Card({ children, style, onPress, accent, accessibilityLabel }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
          styles.card,
          accent && styles.accent,
          hovered && styles.hover,
          focused && styles.focus,
          pressed && styles.pressed,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, accent && styles.accent, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderColor: Colors.border,
    borderWidth: 1,
    padding: Spacing.md,
  },
  accent: { borderColor: Colors.brandBorder, backgroundColor: Colors.surfaceElevated, ...Shadow.card },
  hover: { backgroundColor: Colors.surfaceHover, borderColor: Colors.borderStrong, transform: [{ translateY: -1 }] },
  focus: { borderColor: Colors.brandSoft },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
});
