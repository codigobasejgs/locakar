import { useRouter } from "expo-router";
import { AlertTriangle, Car, ClipboardCheck, FileText, MessageCircle } from "lucide-react-native";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Empty } from "../../components/domain/Screen";
import { SectionHeader, TenantPage } from "../../components/layout/TenantPage";
import { ErrorBanner } from "../../components/domain/ScreenState";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { whatsappUrl } from "../../constants/company";
import { INTEREST_LABEL, RENTAL_STATUS, date, money } from "../../constants/format";
import { Spacing, Type, type ThemeColors } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import { useLayout } from "../../hooks/useLayout";
import { useLocatario } from "../../hooks/useLocatario";

const PERIOD: Record<string, string> = { daily: "Diária", weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", quarterly: "Trimestral", semiannual: "Semestral", annual: "Anual" };

function Field({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function LocacaoScreen() {
  const { colors: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { summary, activeRental: r, error, refreshing, refresh } = useLocatario();
  const others = (summary?.rentals ?? []).filter((x) => x.id !== r?.id);
  const b = r?.billing;
  const paid = r?.installments.filter((i) => i.paid).length ?? 0;
  const { isDesktop, isTablet } = useLayout();
  const wide = isDesktop || isTablet;

  return (
    <TenantPage title="Minha locação" subtitle="Veículo, contrato e condições" refreshing={refreshing} onRefresh={refresh}>
        {error && <ErrorBanner message={error} onRetry={refresh} />}

        {!r ? (
          <Card>
            <Empty icon={<Car color={Colors.textMuted} size={24} />} title="Nenhuma locação" text="Quando sua locação for aprovada, os dados do carro e do contrato aparecem aqui." />
            <Button label="Solicitar locação" onPress={() => router.push("/solicitar")} />
          </Card>
        ) : (
          <>
            <View style={[styles.cols, wide && { flexDirection: "row" }]}>
            <Card style={[{ gap: Spacing.md }, wide && { flex: 1 }]}>
              <View style={styles.header}>
                <Car color={Colors.brandSoft} size={20} />
                <Text style={styles.cardTitle}>Veículo</Text>
                <View style={{ flex: 1 }} />
                <Badge label={RENTAL_STATUS[r.status]?.label ?? r.status} tone={RENTAL_STATUS[r.status]?.tone ?? "neutral"} />
              </View>
              <View style={styles.grid}>
                <Field label="Modelo" value={r.vehicle?.name ?? "—"} />
                <Field label="Placa" value={r.vehicle?.plate ?? "—"} />
                <Field label="Ano" value={r.vehicle?.year ? String(r.vehicle.year) : "—"} />
                <Field label="Combustível" value={r.vehicle?.fuel ?? "—"} />
              </View>
            </Card>

            <Card style={[{ gap: Spacing.md }, wide && { flex: 1 }]}>
              <View style={styles.header}>
                <FileText color={Colors.brandSoft} size={20} />
                <Text style={styles.cardTitle}>Contrato</Text>
              </View>
              <View style={styles.grid}>
                <Field label="Início" value={date(r.startDate)} />
                <Field label="Devolução prevista" value={date(r.endDate)} />
                <Field label="Tipo" value={r.contractType} />
                <Field label="Caução" value={money(r.deposit)} />
                {b && <Field label={`Parcela ${PERIOD[b.period]?.toLowerCase() ?? ""}`} value={money(b.amount)} />}
                <Field label="Parcelas pagas" value={`${paid} de ${r.installments.length}`} />
                {r.kmStart != null && <Field label="Km na retirada" value={`${r.kmStart.toLocaleString("pt-BR")} km`} />}
                {r.kmEnd != null && <Field label="Km na devolução" value={`${r.kmEnd.toLocaleString("pt-BR")} km`} />}
              </View>
              {b && (b.lateFeePercent > 0 || b.interestPercent > 0) && (
                <Text style={styles.muted}>
                  Em caso de atraso: multa de {b.lateFeePercent}% e juros de {b.interestPercent}% {INTEREST_LABEL[b.interestPeriod]}
                  {b.graceDays ? `, após ${b.graceDays} dia(s) do vencimento` : ""}.
                </Text>
              )}
            </Card>
            </View>

            <Button label="Meu veículo e vistorias" icon={<ClipboardCheck color={Colors.text} size={18} />} onPress={() => router.push("/veiculo")} />
            <Button label="Relatar um problema com o veículo" variant="outline" icon={<AlertTriangle color={Colors.text} size={18} />} onPress={() => router.push("/ocorrencias")} />
            <Button
              label="Falar com a LOCAKAR"
              variant="ghost"
              icon={<MessageCircle color={Colors.text} size={18} />}
              onPress={() => Linking.openURL(whatsappUrl(summary?.support.whatsapp, `Olá, LOCAKAR! Sobre a locação do veículo ${r.vehicle?.plate ?? ""}.`))}
            />
          </>
        )}

        {others.length > 0 && (
          <>
            <SectionHeader title="Outras locações" />
            {others.map((x) => (
              <Card key={x.id} style={{ gap: 4 }}>
                <View style={styles.header}>
                  <Text style={[styles.cardTitle, { flex: 1 }]}>{x.vehicle?.name ?? "Veículo"} · {x.vehicle?.plate ?? "—"}</Text>
                  <Badge label={RENTAL_STATUS[x.status]?.label ?? x.status} tone={RENTAL_STATUS[x.status]?.tone ?? "neutral"} />
                </View>
                <Text style={styles.muted}>
                  {date(x.startDate)} a {date(x.endDate)}
                </Text>
              </Card>
            ))}
          </>
        )}
    </TenantPage>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
  cols: { gap: Spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: Spacing.md },
  field: { width: "50%", paddingRight: Spacing.sm },
  label: { ...Type.label, color: Colors.textSubtle },
  value: { ...Type.heading, color: Colors.text, marginTop: 4 },
  muted: { ...Type.small, color: Colors.textMuted },
});
