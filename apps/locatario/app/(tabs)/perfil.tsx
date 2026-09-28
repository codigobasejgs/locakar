import type React from "react";
import { useRouter, type Href } from "expo-router";
import { CalendarDays, ChevronRight, FileText, HelpCircle, LogOut, ShieldCheck, TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { whatsappUrl } from "../../constants/company";
import { date } from "../../constants/format";
import { Colors, Spacing } from "../../constants/theme";
import { useLocatario } from "../../hooks/useLocatario";

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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Perfil</Text>

        <Card style={{ gap: Spacing.md }}>
          <Text style={styles.name}>{c?.name ?? "—"}</Text>
          <Row label="CPF" value={c ? hideCpf(c.cpf) : "—"} />
          <Row label="Telefone" value={c?.phone ?? "—"} />
          <Row label="E-mail" value={c?.email ?? "—"} />
          <Row label="Validade da CNH" value={date(c?.cnhExpiry)} />
          <Text style={styles.muted}>Para alterar seus dados, fale com a LOCAKAR. A CNH nova você envia em Meus documentos.</Text>
        </Card>

        <Card style={{ padding: 0 }}>
          {(
            [
              ["Meus documentos", "/documentos", <FileText key="d" color={Colors.brandSoft} size={20} />],
              ["Multas", "/multas", <TriangleAlert key="m" color={Colors.warning} size={20} />],
              ["Reservas", "/reservas", <CalendarDays key="r" color={Colors.info} size={20} />],
              ["Privacidade e segurança", "/privacidade", <ShieldCheck key="p" color={Colors.success} size={20} />],
            ] as [string, Href, React.ReactNode][]
          ).map(([label, href, icon], i) => (
            <TouchableOpacity key={label} onPress={() => router.push(href)} style={[styles.menu, i > 0 && styles.menuBorder]} accessibilityRole="button">
              {icon}
              <Text style={styles.menuText}>{label}</Text>
              <ChevronRight color={Colors.textSubtle} size={18} />
            </TouchableOpacity>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 110 },
  title: { fontSize: 24, fontWeight: "700", color: Colors.text },
  name: { fontSize: 18, fontWeight: "700", color: Colors.text },
  row: { flexDirection: "row", justifyContent: "space-between", gap: Spacing.md },
  rowLabel: { color: Colors.textMuted, fontSize: 14 },
  rowValue: { color: Colors.text, fontSize: 14, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  muted: { color: Colors.textMuted, fontSize: 13 },
  body: { color: Colors.text, fontSize: 15 },
  menu: { flexDirection: "row", alignItems: "center", gap: Spacing.md, padding: Spacing.md, minHeight: 52 },
  menuBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  menuText: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: "600" },
  version: { textAlign: "center", color: Colors.textSubtle, fontSize: 12, marginTop: Spacing.md },
});
