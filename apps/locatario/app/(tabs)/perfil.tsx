import type React from "react";
import { useRouter, type Href } from "expo-router";
import {
  Building2,
  CalendarDays,
  ChevronRight,
  FileText,
  HelpCircle,
  Laptop,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SectionHeader, TenantPage } from "../../components/layout/TenantPage";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { whatsappUrl } from "../../constants/company";
import { date } from "../../constants/format";
import { Radius, Spacing, Type } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useLocatario } from "../../hooks/useLocatario";
import { useBrandName, useOrg } from "../../context/OrgProvider";

/** CNH: só os 4 últimos dígitos. */
const hideCnh = (n: string) => {
  const d = n.replace(/\D/g, "");
  return d.length > 4 ? `••••••${d.slice(-4)}` : "—";
};

/** CPF parcialmente oculto (***.456.789-**), como no painel. */
const hideCpf = (cpf: string) => {
  const d = cpf.replace(/\D/g, "");
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "—";
};

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

export default function PerfilScreen() {
  const brandName = useBrandName();
  const router = useRouter();
  const { summary, signOut, refresh } = useLocatario();
  const { colors, mode, setMode } = useTheme();
  const { switchOrg } = useOrg();
  const [confirmExit, setConfirmExit] = useState(false);
  const [switching, setSwitching] = useState(false);
  const c = summary?.client;
  const initials = (c?.name ?? "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "•";

  const themeOptions: { key: "dark" | "light" | "system"; label: string; icon: LucideIcon }[] = [
    { key: "dark", label: "Escuro", icon: Moon },
    { key: "light", label: "Claro", icon: Sun },
    { key: "system", label: "Sistema", icon: Laptop },
  ];

  return (
    <TenantPage title="Perfil" subtitle="Seus dados e preferências">
      <Card style={{ gap: Spacing.md }}>
        <View style={styles.identity}>
          <View style={[styles.avatar, { backgroundColor: colors.brandTint, borderColor: colors.brandBorder }]}>
            <Text style={[styles.avatarText, { color: colors.text }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
              {c?.name ?? "—"}
            </Text>
            <Badge label={summary?.consent ? "Conta ativa" : "Pendente"} tone={summary?.consent ? "success" : "warning"} />
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Row label="CPF" value={c ? hideCpf(c.cpf) : "—"} />
        <Row label="Telefone" value={c?.phone ?? "—"} />
        <Row label="E-mail" value={c?.email ?? "—"} />
        {c?.cnhNumber ? <Row label="CNH" value={hideCnh(c.cnhNumber)} /> : null}
        <Row label="Validade da CNH" value={date(c?.cnhExpiry)} />
        <Text style={[styles.muted, { color: colors.textMuted }]}>
          Para alterar seus dados, fale com a {brandName}. A CNH nova você envia em Meus documentos.
        </Text>
      </Card>

      {/* Seção Aparência */}
      <SectionHeader title="Aparência" />
      <Card style={{ gap: Spacing.s12 }}>
        <Text style={[styles.fieldTitle, { color: colors.text }]}>Tema do aplicativo</Text>
        <Text style={[styles.muted, { color: colors.textMuted }]}>
          Escolha entre o visual escuro cinematográfico, claro executivo ou acompanhe o sistema operacional.
        </Text>
        <View style={styles.themeGrid}>
          {themeOptions.map((opt) => {
            const active = mode === opt.key;
            const Icon = opt.icon;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setMode(opt.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`Tema ${opt.label}`}
                style={({ pressed }) => [
                  styles.themeOption,
                  {
                    backgroundColor: active ? colors.brandTint : colors.surfaceElevated,
                    borderColor: active ? colors.brandBorder : colors.border,
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Icon color={active ? colors.brandSoft : colors.textMuted} size={20} />
                <Text
                  style={[
                    styles.themeLabel,
                    { color: active ? colors.text : colors.textMuted },
                    active && { fontWeight: "700" },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <SectionHeader title="Conta" />
      <Card style={{ padding: 0 }}>
        {(
          [
            ["Meus documentos", "/documentos", <FileText key="d" color={colors.brandSoft} size={18} />],
            ["Multas", "/multas", <TriangleAlert key="m" color={colors.brandSoft} size={18} />],
            ["Reservas", "/reservas", <CalendarDays key="r" color={colors.brandSoft} size={18} />],
            ["Privacidade e segurança", "/privacidade", <ShieldCheck key="p" color={colors.brandSoft} size={18} />],
          ] as [string, Href, React.ReactNode][]
        ).map(([label, href, icon], i) => (
          <Pressable
            key={label}
            onPress={() => router.push(href)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.menu,
              i > 0 && [styles.menuBorder, { borderTopColor: colors.border }],
              (pressed || hovered) && { backgroundColor: colors.surfaceHover },
            ]}
            accessibilityRole="button"
          >
            <View style={[styles.menuIcon, { backgroundColor: colors.surfaceElevated }]}>{icon}</View>
            <Text style={[styles.menuText, { color: colors.text }]}>{label}</Text>
            <ChevronRight color={colors.textSubtle} size={18} />
          </Pressable>
        ))}
      </Card>

      {(summary?.organizations?.length ?? 0) > 1 && (
        <>
          <SectionHeader title="Suas locadoras" />
          <Card style={{ gap: Spacing.xs }}>
            {summary!.organizations!.map((o) => (
              <Pressable
                key={o.id}
                disabled={o.active || switching}
                onPress={async () => {
                  setSwitching(true);
                  await switchOrg(o.slug);
                  await refresh();
                  setSwitching(false);
                }}
                style={({ pressed }) => [styles.menu, pressed && { backgroundColor: colors.surfaceHover }]}
                accessibilityRole="button"
                accessibilityState={{ selected: o.active }}
              >
                <View style={[styles.menuIcon, { backgroundColor: colors.surfaceElevated }]}>
                  <Building2 color={o.active ? colors.brandSoft : colors.textMuted} size={18} />
                </View>
                <Text style={[styles.menuText, { color: colors.text }]}>{o.name}</Text>
                {o.active ? <Badge label="Atual" tone="success" /> : <ChevronRight color={colors.textSubtle} size={18} />}
              </Pressable>
            ))}
          </Card>
        </>
      )}

      <Button
        label={`Suporte no WhatsApp ${summary?.support.display ?? ""}`.trim()}
        variant="outline"
        icon={<HelpCircle color={colors.text} size={18} />}
        onPress={() => Linking.openURL(whatsappUrl(summary?.support.whatsapp, `Olá, ${brandName}! Preciso de ajuda com minha conta no app.`))}
      />

      {confirmExit ? (
        <Card style={{ gap: Spacing.sm }}>
          <Text style={[styles.body, { color: colors.text }]}>Sair desta conta neste aparelho?</Text>
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <Button label="Cancelar" variant="ghost" onPress={() => setConfirmExit(false)} style={{ flex: 1 }} />
            <Button label="Sair" variant="danger" onPress={signOut} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : (
        <Button label="Sair da conta" variant="ghost" icon={<LogOut color={colors.danger} size={18} />} onPress={() => setConfirmExit(true)} />
      )}

      <Text style={[styles.version, { color: colors.textSubtle }]}>{brandName} · app do locatário 1.0.0</Text>
    </TenantPage>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 52, height: 52, borderRadius: Radius.full, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  avatarText: { fontSize: 17, fontWeight: "700" },
  divider: { height: 1 },
  name: { ...Type.title, fontSize: 18, lineHeight: 24 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.md },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  muted: { fontSize: 13, lineHeight: 18 },
  fieldTitle: { ...Type.heading, fontSize: 15 },
  themeGrid: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.xs },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.s12,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    minHeight: 46,
  },
  themeLabel: { fontSize: 13, fontWeight: "600" },
  body: { fontSize: 15 },
  menu: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, minHeight: 56 },
  menuIcon: { width: 34, height: 34, borderRadius: Radius.md, alignItems: "center", justifyContent: "center" },
  menuBorder: { borderTopWidth: 1 },
  menuText: { flex: 1, fontSize: 15, fontWeight: "600" },
  version: { textAlign: "center", fontSize: 12, marginTop: Spacing.md },
});
