import React, { useEffect, useRef } from "react";
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Radius, Spacing, Type } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useLayout } from "../../hooks/useLayout";
import { ErrorBanner } from "./ScreenState";

/** Corpo padrão das telas internas: rolagem natural, safe area, largura máxima por faixa, skeleton ao carregar. */
export function Screen({
  children,
  refreshing = false,
  onRefresh,
  error,
  loading,
}: {
  children?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  error?: string | null;
  loading?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { gutter, contentMax, isDesktop } = useLayout();
  const { colors } = useTheme();

  return (
    <ScrollView
      style={[styles.safe, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingTop: isDesktop ? Spacing.lg : Spacing.md,
        paddingBottom: insets.bottom + Spacing.xl,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandSoft} />
        ) : undefined
      }
    >
      <View style={[styles.inner, { maxWidth: Math.min(contentMax, 820) }]}>
        {error && onRefresh && <ErrorBanner message={error} onRetry={onRefresh} />}
        {loading ? <SkeletonList /> : children}
      </View>
    </ScrollView>
  );
}

/** Bloco pulsante discreto adaptado ao tema ativo. */
export function Skeleton({
  height = 16,
  width = "100%",
  radius = Radius.sm,
}: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={{ height, width, borderRadius: radius, backgroundColor: colors.skeleton, opacity }} />;
}

export function SkeletonList() {
  const { colors } = useTheme();

  return (
    <View style={{ gap: Spacing.md }} accessibilityLabel="Carregando" accessibilityRole="progressbar">
      <View style={[styles.skeletonCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Skeleton width="55%" height={20} />
        <Skeleton width="35%" />
        <Skeleton height={44} radius={Radius.md} />
      </View>
      <View style={[styles.skeletonCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Skeleton width="40%" />
        <Skeleton width="80%" />
      </View>
    </View>
  );
}

export function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text?: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.empty}>
      <View
        style={[
          styles.emptyIcon,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        ]}
      >
        {icon}
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {text && <Text style={[styles.emptyText, { color: colors.textMuted }]}>{text}</Text>}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme();

  return (
    <Text style={[styles.section, { color: colors.textMuted }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inner: { width: "100%", alignSelf: "center", gap: Spacing.md },
  skeletonCard: { gap: Spacing.s12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1 },
  empty: { alignItems: "center", paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  emptyTitle: { ...Type.heading, textAlign: "center" },
  emptyText: { ...Type.small, textAlign: "center", maxWidth: 360 },
  section: { ...Type.label, marginTop: Spacing.sm },
});
