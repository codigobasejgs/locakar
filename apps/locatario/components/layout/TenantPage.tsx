import { useRouter } from "expo-router";
import { Moon, Sun } from "lucide-react-native";
import React from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Radius, Spacing, Type } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useLayout } from "../../hooks/useLayout";
import { useLocatario } from "../../hooks/useLocatario";

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
  showBrand?: boolean;
}) {
  const { isDesktop, gutter, contentMax } = useLayout();
  const { colors } = useTheme();

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={isDesktop ? ["top"] : ["top", "left", "right"]}
    >
      {!isDesktop && showBrand && <MobileHeader gutter={gutter} />}
      <ScrollView
        style={[styles.safe, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: gutter, paddingTop: isDesktop ? Spacing.xl : Spacing.md },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandSoft} />
          ) : undefined
        }
      >
        <View style={[styles.inner, { maxWidth: contentMax, gap: isDesktop ? Spacing.lg : Spacing.md }]}>
          {title && (
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.text }, isDesktop && styles.titleDesktop]} accessibilityRole="header">
                {title}
              </Text>
              {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
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
  const { colors, isDark, toggleTheme, logoSource } = useTheme();

  const initials = (summary?.client.name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <View
      style={[
        styles.header,
        {
          paddingHorizontal: gutter,
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Image source={logoSource} style={styles.logo} resizeMode="contain" accessibilityLabel="LOCAKAR" />

      <View style={styles.headerRight}>
        <Pressable
          onPress={toggleTheme}
          accessibilityRole="button"
          accessibilityLabel={isDark ? "Alternar para tema claro" : "Alternar para tema escuro"}
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerButton,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}
        >
          {isDark ? <Sun color={colors.textMuted} size={18} /> : <Moon color={colors.textMuted} size={18} />}
        </Pressable>

        <Pressable
          onPress={() => router.push("/(tabs)/perfil")}
          accessibilityRole="button"
          accessibilityLabel="Abrir perfil"
          hitSlop={8}
          style={({ pressed }) => [
            styles.avatar,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.brandBorder },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.avatarText, { color: colors.text }]}>{initials || "•"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Título de seção com ação opcional à direita. */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textMuted }]} accessibilityRole="header">
        {title}
      </Text>
      {action && onAction && (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.sectionAction, { color: colors.brandSoft }]}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: Spacing.xl, flexGrow: 1 },
  inner: { width: "100%", alignSelf: "center" },
  titleBlock: { gap: Spacing.xs },
  title: { ...Type.title },
  titleDesktop: { ...Type.display },
  subtitle: { ...Type.small },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 84, height: 44 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 13, fontWeight: "700" },
  section: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: Spacing.sm },
  sectionTitle: { ...Type.label },
  sectionAction: { fontSize: 13, fontWeight: "600" },
});
