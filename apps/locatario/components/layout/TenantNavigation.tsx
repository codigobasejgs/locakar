import { useRouter, type Href } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { CalendarDays, CarFront, CreditCard, FileText, House, KeyRound, LogOut, MessageCircle, TriangleAlert, UserRound, BadgeAlert, type LucideIcon } from "lucide-react-native";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { whatsappUrl } from "../../constants/company";
import { Colors, Radius, SIDEBAR_WIDTH, Spacing, TAB_BAR_HEIGHT, Type } from "../../constants/theme";
import { useLayout } from "../../hooks/useLayout";
import { useLocatario } from "../../hooks/useLocatario";

const logo = require("../../assets/logo-light.png");

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
  return (
    <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]} accessibilityRole="tablist">
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
            <View style={[styles.bottomPill, focused && styles.bottomPillActive]}>
              <Icon color={focused ? Colors.brandSoft : Colors.textSubtle} size={22} strokeWidth={focused ? 2.2 : 1.8} />
            </View>
            <Text numberOfLines={1} style={[styles.bottomLabel, focused && styles.bottomLabelActive]}>
              {tab.short}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NavItem({ label, icon: Icon, active, onPress }: { label: string; icon: LucideIcon; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.navItem, (hovered || pressed) && !active && styles.navItemHover, active && styles.navItemActive]}
    >
      <Icon color={active ? Colors.brandSoft : Colors.textMuted} size={19} strokeWidth={active ? 2.2 : 1.8} />
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Sidebar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const { summary, signOut } = useLocatario();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.sidebar, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + Spacing.lg }]}>
      <Image source={logo} style={styles.sideLogo} resizeMode="contain" accessibilityLabel="LOCAKAR" />
      <View style={styles.navGroup} accessibilityRole="menu">
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab || route.name === "perfil") return null;
          return <NavItem key={route.key} label={tab.label} icon={tab.icon} active={state.index === index} onPress={() => navigation.navigate(route.name)} />;
        })}
        <Text style={styles.navSection}>Serviços</Text>
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
      <View style={styles.sideFooter}>
        {state.routes.map((route, index) =>
          route.name === "perfil" ? (
            <NavItem key={route.key} label={summary?.client.name.split(" ")[0] ?? "Perfil"} icon={UserRound} active={state.index === index} onPress={() => navigation.navigate(route.name)} />
          ) : null,
        )}
        <NavItem label="Sair" icon={LogOut} onPress={signOut} />
        <Text style={styles.brandLine}>LOCAKAR · Locadora de veículos</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
    minHeight: TAB_BAR_HEIGHT,
  },
  bottomItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, minHeight: 48, paddingHorizontal: 2 },
  bottomPill: { width: 56, height: 30, borderRadius: Radius.full, alignItems: "center", justifyContent: "center" },
  bottomPillActive: { backgroundColor: Colors.brandTint },
  bottomLabel: { fontSize: 11, lineHeight: 14, fontWeight: "500", color: Colors.textSubtle, textAlign: "center" },
  bottomLabelActive: { color: Colors.text, fontWeight: "600" },

  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingHorizontal: Spacing.md,
  },
  sideLogo: { width: 120, height: 62, marginLeft: Spacing.sm, marginBottom: Spacing.lg },
  navGroup: { gap: 2 },
  navSection: { ...Type.label, color: Colors.textSubtle, marginTop: Spacing.lg, marginBottom: Spacing.sm, marginLeft: Spacing.s12 },
  navItem: { flexDirection: "row", alignItems: "center", gap: Spacing.s12, paddingHorizontal: Spacing.s12, minHeight: 42, borderRadius: Radius.md },
  navItemHover: { backgroundColor: Colors.surfaceHover },
  navItemActive: { backgroundColor: Colors.brandTint },
  navLabel: { fontSize: 14, fontWeight: "500", color: Colors.textMuted },
  navLabelActive: { color: Colors.text, fontWeight: "600" },
  sideFooter: { gap: 2, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  brandLine: { fontSize: 11, color: Colors.textSubtle, marginTop: Spacing.md, marginLeft: Spacing.s12 },
});
