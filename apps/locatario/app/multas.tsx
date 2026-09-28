import { MessageCircle, ShieldCheck } from "lucide-react-native";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Empty, Screen } from "../components/domain/Screen";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { whatsappUrl } from "../constants/company";
import { date, money } from "../constants/format";
import { FINE_STATUS } from "../constants/tenant";
import { Colors, Spacing } from "../constants/theme";
import { useApi } from "../hooks/useApi";
import { useLocatario } from "../hooks/useLocatario";
import type { Fine } from "../services/api";

/** Multas do período em que o carro estava com o cliente, com prazos de indicação de condutor e desconto. */
export default function MultasScreen() {
  const { summary } = useLocatario();
  const { data, error, reload } = useApi<{ fines: Fine[] }>("/api/tenant/vehicle");
  const today = summary?.today ?? "";
  const fines = data?.fines ?? [];

  return (
    <Screen error={error} onRefresh={reload}>
      {!fines.length ? (
        <Empty icon={<ShieldCheck color={Colors.success} size={40} />} title="Nenhuma multa" text="Se chegar alguma multa do período da sua locação, ela aparece aqui com os prazos." />
      ) : (
        fines.map((f) => {
          const open = f.status !== "paid" && f.status !== "contested";
          const identify = open && f.driverIdDeadline && f.driverIdDeadline >= today;
          const discount = open && f.discountDeadline && f.discountDeadline >= today;
          return (
            <Card key={f.id} style={{ gap: Spacing.sm }}>
              <View style={styles.row}>
                <Text style={[styles.title, { flex: 1 }]}>{money(f.amount)}</Text>
                <Badge label={FINE_STATUS[f.status]?.label ?? f.status} tone={FINE_STATUS[f.status]?.tone} />
              </View>
              <Text style={styles.body}>{f.description}</Text>
              <Text style={styles.muted}>
                Auto {f.noticeNumber} · infração em {date(f.infractionDate)} · vence {date(f.dueDate)}
              </Text>
              {identify && <Text style={styles.warn}>Indique o condutor até {date(f.driverIdDeadline)} para evitar multa extra.</Text>}
              {discount && <Text style={styles.ok}>Pagando até {date(f.discountDeadline)} há desconto.</Text>}
              {open && (
                <Button
                  label="Falar sobre esta multa"
                  size="sm"
                  variant="outline"
                  icon={<MessageCircle color={Colors.text} size={16} />}
                  onPress={() => Linking.openURL(whatsappUrl(summary?.support.whatsapp, `Olá, LOCAKAR! Sobre a multa ${f.noticeNumber} de ${date(f.infractionDate)}.`))}
                />
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { color: Colors.text, fontSize: 18, fontWeight: "800" },
  body: { color: Colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: Colors.textMuted, fontSize: 12 },
  warn: { color: Colors.warning, fontSize: 13, fontWeight: "600" },
  ok: { color: Colors.success, fontSize: 13, fontWeight: "600" },
});
