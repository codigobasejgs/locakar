import React from "react";
import { GestureResponderEvent, Pressable, StyleProp, View, ViewStyle } from "react-native";
import { Radius, Spacing, getShadow } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";

interface CardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (event: GestureResponderEvent) => void;
  accent?: boolean;
  accessibilityLabel?: string;
}

/** Superfície padrão adaptada ao tema ativo (Dark ou Light). */
export function Card({ children, style, onPress, accent, accessibilityLabel }: CardProps) {
  const { colors, theme } = useTheme();
  const shadow = getShadow(theme);

  const baseStyle: ViewStyle = {
    backgroundColor: accent ? colors.surfaceElevated : colors.card,
    borderRadius: Radius.lg,
    borderColor: accent ? colors.brandBorder : colors.border,
    borderWidth: 1,
    padding: Spacing.md,
    ...(accent ? shadow : {}),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
          baseStyle,
          hovered && {
            backgroundColor: colors.surfaceHover,
            borderColor: colors.borderStrong,
            transform: [{ translateY: -1 }],
          },
          focused && { borderColor: colors.brandSoft },
          pressed && { transform: [{ scale: 0.985 }], opacity: 0.92 },
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[baseStyle, style]}>{children}</View>;
}
