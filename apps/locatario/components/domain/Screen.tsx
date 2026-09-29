import React, { useEffect, useRef } from "react";
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors, Radius, Spacing, Type } from "../../constants/theme";
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
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  error?: string | null;
  loading?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { gutter, contentMax, isDesktop } = useLayout();
  return (
    <ScrollView
      style={styles.safe}
      contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: isDesktop ? Spacing.lg : Spacing.md, paddingBottom: insets.bottom + Spacing.xl }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandSoft} /> : undefined}
    >
      <View style={[styles.inner, { maxWidth: Math.min(contentMax, 820) }]}>
        {error && onRefresh && <ErrorBanner message={error} onRetry={onRefresh} />}
        {loading ? <SkeletonList /> : children}
      </View>
    </ScrollView>
  );
}

/** Bloco pulsante discreto (respeita "reduzir movimento" por não depender de animação para ler a tela). */
export function Skeleton({ height = 16, width = "100%", radius = Radius.sm }: { height?: number; width?: number | `${number}%`; radius?: number }) {
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
  return <Animated.View style={{ height, width, borderRadius: radius, backgroundColor: Colors.skeleton, opacity }} />;
}

export function SkeletonList() {
  return (
    <View style={{ gap: Spacing.md }} accessibilityLabel="Carregando" accessibilityRole="progressbar">
      <View style={styles.skeletonCard}>
        <Skeleton width="55%" height={20} />
        <Skeleton width="35%" />
        <Skeleton height={44} radius={Radius.md} />
      </View>
      <View style={styles.skeletonCard}>
        <Skeleton width="40%" />
        <Skeleton width="80%" />
      </View>
    </View>
  );
}

export function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text?: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon}</View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text && <Text style={styles.emptyText}>{text}</Text>}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={styles.section} accessibilityRole="header">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  inner: { width: "100%", alignSelf: "center", gap: Spacing.md },
  skeletonCard: { gap: Spacing.s12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  empty: { alignItems: "center", paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  emptyIcon: { width: 56, height: 56, borderRadius: Radius.full, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.xs },
  emptyTitle: { ...Type.heading, color: Colors.text, textAlign: "center" },
  emptyText: { ...Type.small, color: Colors.textMuted, textAlign: "center", maxWidth: 360 },
  section: { ...Type.label, color: Colors.textMuted, marginTop: Spacing.sm },
});
