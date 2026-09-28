import React from "react";
import { StyleSheet, View, TouchableOpacity, StyleProp, ViewStyle, GestureResponderEvent } from "react-native";
import { Colors, Radius, Spacing } from "../../constants/theme";

interface CardProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (event: GestureResponderEvent) => void;
  accent?: boolean;
}

export function Card({ children, style, onPress, accent }: CardProps) {
  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={[styles.card, accent && styles.accent, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, accent && styles.accent, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderColor: Colors.border,
    borderWidth: 1,
    padding: Spacing.md,
  },
  accent: {
    borderColor: Colors.brandGlow,
    backgroundColor: "#130A17",
  },
});
