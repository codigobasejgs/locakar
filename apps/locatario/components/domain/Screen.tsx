import React from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Colors, Spacing } from "../../constants/theme";
import { ErrorBanner } from "./ScreenState";

/** Corpo padrão das telas internas: rolagem, puxar para atualizar, erro sem esconder o conteúdo. */
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
  return (
    <ScrollView
      style={styles.safe}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandSoft} /> : undefined}
    >
      {error && onRefresh && <ErrorBanner message={error} onRetry={onRefresh} />}
      {loading ? <ActivityIndicator color={Colors.brandSoft} style={{ marginTop: Spacing.xl }} accessibilityLabel="Carregando" /> : children}
    </ScrollView>
  );
}

export function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text?: string }) {
  return (
    <View style={styles.empty}>
      {icon}
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
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl, maxWidth: 640, width: "100%", alignSelf: "center" },
  empty: { alignItems: "center", padding: Spacing.xl, gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "600" },
  emptyText: { color: Colors.textMuted, fontSize: 14, textAlign: "center", lineHeight: 20 },
  section: { fontSize: 13, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginTop: Spacing.sm },
});
