import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Colors, Radius, Spacing, Type } from "../../constants/theme";
import { useLayout } from "../../hooks/useLayout";
import { useLocatario } from "../../hooks/useLocatario";

const logo = require("../../assets/logo-light.png");

/**
 * Página das abas: header (logo no celular, título no desktop), rolagem natural,
 * gutter e largura máxima por faixa. A barra inferior não é absoluta, então nada fica escondido embaixo dela.
 */
export function TenantPage({
  title,
  subtitle,
  children,
  refreshing = false,
  onRefresh,
  showBrand = false,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Header com logo (início). */
  showBrand?: boolean;
}) {
  const { isDesktop, gutter, contentMax } = useLayout();
  return (
    <SafeAreaView style={styles.safe} edges={isDesktop ? ["top"] : ["top", "left", "right"]}>
      {!isDesktop && showBrand && <MobileHeader gutter={gutter} />}
      <ScrollView
        style={styles.safe}
        contentContainerStyle={[styles.scroll, { paddingHorizontal: gutter, paddingTop: isDesktop ? Spacing.xl : Spacing.md }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.brandSoft} /> : undefined}
      >
        <View style={[styles.inner, { maxWidth: contentMax, gap: isDesktop ? Spacing.lg : Spacing.md }]}>
          {title && (
            <View style={styles.titleBlock}>
              <Text style={[styles.title, isDesktop && styles.titleDesktop]} accessibilityRole="header">
                {title}
              </Text>
              {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
          )}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MobileHeader({ gutter }: { gutter: number }) {
  const router = useRouter();
  const { summary } = useLocatario();
  const initials = (summary?.client.name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <View style={[styles.header, { paddingHorizontal: gutter }]}>
      <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="LOCAKAR" />
      <Pressable
        onPress={() => router.push("/(tabs)/perfil")}
        accessibilityRole="button"
        accessibilityLabel="Abrir perfil"
        hitSlop={8}
        style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.avatarText}>{initials || "•"}</Text>
      </Pressable>
    </View>
  );
}

/** Título de seção com ação opcional à direita. */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {action && onAction && (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingBottom: Spacing.xl, flexGrow: 1 },
  inner: { width: "100%", alignSelf: "center" },
  titleBlock: { gap: Spacing.xs },
  title: { ...Type.title, color: Colors.text },
  titleDesktop: { ...Type.display },
  subtitle: { ...Type.small, color: Colors.textMuted },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  logo: { width: 84, height: 44 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.brandBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: Colors.text, fontSize: 13, fontWeight: "700" },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: Spacing.sm },
  sectionTitle: { ...Type.label, color: Colors.textMuted },
  sectionAction: { fontSize: 13, fontWeight: "600", color: Colors.brandSoft },
});
