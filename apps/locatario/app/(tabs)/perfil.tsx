import type React from "react";
import { useRouter, type Href } from "expo-router";
import { CalendarDays, ChevronRight, FileText, HelpCircle, LogOut, ShieldCheck, TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SectionHeader, TenantPage } from "../../components/layout/TenantPage";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { whatsappUrl } from "../../constants/company";
import { date } from "../../constants/format";
import { Colors, Radius, Spacing, Type } from "../../constants/theme";
import { useLocatario } from "../../hooks/useLocatario";

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
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function PerfilScreen() {
  const router = useRouter();
  const { summary, signOut } = useLocatario();
  const [confirmExit, setConfirmExit] = useState(false);
  const c = summary?.client;
  const initials = (c?.name ?? "").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "•";

  return (
    <TenantPage title="Perfil" subtitle="Seus dados e preferências">
        <Card style={{ gap: Spacing.md }}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Text style={styles.name} numberOfLines={2}>{c?.name ?? "—"}</Text>
              <Badge label={summary?.consent ? "Conta ativa" : "Pendente"} tone={summary?.consent ? "success" : "warning"} />
            </View>
          </View>
          <View style={styles.divider} />
          <Row label="CPF" value={c ? hideCpf(c.cpf) : "—"} />
          <Row label="Telefone" value={c?.phone ?? "—"} />
          <Row label="E-mail" value={c?.email ?? "—"} />
          {c?.cnhNumber ? <Row label="CNH" value={hideCnh(c.cnhNumber)} /> : null}
          <Row label="Validade da CNH" value={date(c?.cnhExpiry)} />
          <Text style={styles.muted}>Para alterar seus dados, fale com a LOCAKAR. A CNH nova você envia em Meus documentos.</Text>
        </Card>

        <SectionHeader title="Conta" />
        <Card style={{ padding: 0 }}>
          {(
            [
              ["Meus documentos", "/documentos", <FileText key="d" color={Colors.brandSoft} size={18} />],
              ["Multas", "/multas", <TriangleAlert key="m" color={Colors.brandSoft} size={18} />],
              ["Reservas", "/reservas", <CalendarDays key="r" color={Colors.brandSoft} size={18} />],
              ["Privacidade e segurança", "/privacidade", <ShieldCheck key="p" color={Colors.brandSoft} size={18} />],
            ] as [string, Href, React.ReactNode][]
          ).map(([label, href, icon], i) => (
            <Pressable
              key={label}
              onPress={() => router.push(href)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.menu, i > 0 && styles.menuBorder, (pressed || hovered) && styles.menuHover]}
              accessibilityRole="button"
            >
              <View style={styles.menuIcon}>{icon}</View>
              <Text style={styles.menuText}>{label}</Text>
              <ChevronRight color={Colors.textSubtle} size={18} />
            </Pressable>
          ))}
        </Card>

        <Button
          label={`Suporte no WhatsApp ${summary?.support.display ?? ""}`.trim()}
          variant="outline"
          icon={<HelpCircle color={Colors.text} size={18} />}
          onPress={() => Linking.openURL(whatsappUrl(summary?.support.whatsapp, "Olá, LOCAKAR! Preciso de ajuda com minha conta no app."))}
        />

        {confirmExit ? (
          <Card style={{ gap: Spacing.sm }}>
            <Text style={styles.body}>Sair desta conta neste aparelho?</Text>
            <View style={{ flexDirection: "row", gap: Spacing.sm }}>
              <Button label="Cancelar" variant="ghost" onPress={() => setConfirmExit(false)} style={{ flex: 1 }} />
              <Button label="Sair" variant="danger" onPress={signOut} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : (
          <Button label="Sair da conta" variant="ghost" icon={<LogOut color={Colors.danger} size={18} />} onPress={() => setConfirmExit(true)} />
        )}

        <Text style={styles.version}>LOCAKAR · app do locatário 1.0.0</Text>
    </TenantPage>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: { width: 52, height: 52, borderRadius: Radius.full, alignItems: "center", justifyContent: "center", backgroundColor: Colors.brandTint, borderWidth: 1, borderColor: Colors.brandBorder },
  avatarText: { color: Colors.text, fontSize: 17, fontWeight: "700" },
  divider: { height: 1, backgroundColor: Colors.border },
  name: { ...Type.title, fontSize: 18, lineHeight: 24, color: Colors.text },
  row: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.md },
  rowLabel: { color: Colors.textMuted, fontSize: 14 },
  rowValue: { color: Colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  muted: { color: Colors.textMuted, fontSize: 13 },
  body: { color: Colors.text, fontSize: 15 },
  menu: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, minHeight: 56 },
  menuHover: { backgroundColor: Colors.surfaceHover },
  menuIcon: { width: 34, height: 34, borderRadius: Radius.md, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surfaceElevated },
  menuBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  menuText: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: "600" },
  version: { textAlign: "center", color: Colors.textSubtle, fontSize: 12, marginTop: Spacing.md },
});
