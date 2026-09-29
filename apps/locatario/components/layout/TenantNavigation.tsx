import { useRouter, type Href } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import {
  BadgeAlert,
  CalendarDays,
  CarFront,
  CreditCard,
  FileText,
  House,
  KeyRound,
  LogOut,
  MessageCircle,
  Moon,
  Sun,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { whatsappUrl } from "../../constants/company";
import { Radius, SIDEBAR_WIDTH, Spacing, TAB_BAR_HEIGHT, Type } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useLayout } from "../../hooks/useLayout";
import { useLocatario } from "../../hooks/useLocatario";

/** Abas do navegador (mesmos nomes de arquivo em app/(tabs)). */
const TABS: Record<string, { label: string; short: string; icon: LucideIcon }> = {
  inicio: { label: "Início", short: "Início", icon: House },
  locacao: { label: "Minha locação", short: "Locação", icon: KeyRound },
  pagamentos: { label: "Pagamentos", short: "Pagamentos", icon: CreditCard },
  perfil: { label: "Perfil", short: "Perfil", icon: UserRound },
};

/** Atalhos extras da barra lateral (telas de pilha já existentes). */
const LINKS: { label: string; href: Href; icon: LucideIcon }[] = [
  { label: "Meu veículo", href: "/veiculo", icon: CarFront },
  { label: "Documentos", href: "/documentos", icon: FileText },
  { label: "Reservas", href: "/reservas", icon: CalendarDays },
  { label: "Multas", href: "/multas", icon: BadgeAlert },
  { label: "Relatar problema", href: "/ocorrencias", icon: TriangleAlert },
];

/** Uma única barra: inferior no celular/tablet, lateral no desktop. */
export function TenantTabBar(props: BottomTabBarProps) {
  const { isDesktop } = useLayout();
  return isDesktop ? <Sidebar {...props} /> : <BottomBar {...props} />;
}

function BottomBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.bottom,
        {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.tabBarBorder,
          paddingBottom: Math.max(insets.bottom, Spacing.sm),
        },
      ]}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const Icon = tab.icon;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            onPress={() => {
              const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={({ pressed }) => [styles.bottomItem, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.bottomPill, focused && { backgroundColor: colors.tabBarActiveBg }]}>
              <Icon color={focused ? colors.brandSoft : colors.textSubtle} size={22} strokeWidth={focused ? 2.2 : 1.8} />
            </View>
            <Text
              numberOfLines={1}
              style={[
                styles.bottomLabel,
                { color: focused ? colors.text : colors.textSubtle },
                focused && { fontWeight: "600" },
              ]}
            >
              {tab.short}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NavItem({
  label,
  icon: Icon,
  active,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.navItem,
        (hovered || pressed) && !active && { backgroundColor: colors.surfaceHover },
        active && { backgroundColor: colors.brandTint },
      ]}
    >
      <Icon color={active ? colors.brandSoft : colors.textMuted} size={19} strokeWidth={active ? 2.2 : 1.8} />
      <Text style={[styles.navLabel, { color: active ? colors.text : colors.textMuted }, active && { fontWeight: "600" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Sidebar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const { summary, signOut } = useLocatario();
  const { colors, isDark, toggleTheme, logoSource } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: colors.surface,
          borderRightColor: colors.border,
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.lg,
        },
      ]}
    >
      <Image source={logoSource} style={styles.sideLogo} resizeMode="contain" accessibilityLabel="LOCAKAR" />
      <View style={styles.navGroup} accessibilityRole="menu">
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab || route.name === "perfil") return null;
          return <NavItem key={route.key} label={tab.label} icon={tab.icon} active={state.index === index} onPress={() => navigation.navigate(route.name)} />;
        })}
        <Text style={[styles.navSection, { color: colors.textSubtle }]}>Serviços</Text>
        {LINKS.map((l) => (
          <NavItem key={l.label} label={l.label} icon={l.icon} onPress={() => router.push(l.href)} />
        ))}
        <NavItem
          label="Suporte"
          icon={MessageCircle}
          onPress={() => Linking.openURL(whatsappUrl(summary?.support.whatsapp, "Olá, LOCAKAR! Preciso de ajuda com minha locação."))}
        />
      </View>
      <View style={{ flex: 1 }} />
      <View style={[styles.sideFooter, { borderTopColor: colors.border }]}>
        <NavItem
          label={isDark ? "Modo Claro" : "Modo Escuro"}
          icon={isDark ? Sun : Moon}
          onPress={toggleTheme}
        />
        {state.routes.map((route, index) =>
          route.name === "perfil" ? (
            <NavItem
              key={route.key}
              label={summary?.client.name.split(" ")[0] ?? "Perfil"}
              icon={UserRound}
              active={state.index === index}
              onPress={() => navigation.navigate(route.name)}
            />
          ) : null,
        )}
        <NavItem label="Sair" icon={LogOut} onPress={signOut} />
        <Text style={[styles.brandLine, { color: colors.textSubtle }]}>LOCAKAR · Locadora de veículos</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
    minHeight: TAB_BAR_HEIGHT,
  },
  bottomItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 48, paddingHorizontal: 2 },
  bottomPill: { width: 56, height: 30, borderRadius: Radius.full, alignItems: "center", justifyContent: "center" },
  bottomLabel: { fontSize: 11, lineHeight: 14, fontWeight: "500", textAlign: "center" },

  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    paddingHorizontal: Spacing.md,
  },
  sideLogo: { width: 120, height: 62, marginLeft: Spacing.sm, marginBottom: Spacing.lg },
  navGroup: { gap: 2 },
  navSection: { ...Type.label, marginTop: Spacing.lg, marginBottom: Spacing.sm, marginLeft: Spacing.s12 },
  navItem: { flexDirection: "row", alignItems: "center", gap: Spacing.s12, paddingHorizontal: Spacing.s12, minHeight: 42, borderRadius: Radius.md },
  navLabel: { fontSize: 14, fontWeight: "500" },
  sideFooter: { gap: 2, borderTopWidth: 1, paddingTop: Spacing.md },
  brandLine: { fontSize: 11, marginTop: Spacing.md, marginLeft: Spacing.s12 },
});
