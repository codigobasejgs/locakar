import { useRouter } from "expo-router";
import { AlertTriangle, CalendarDays, Car, ClipboardCheck, Clock, CreditCard, FileText, MessageCircle, Sparkles, TriangleAlert } from "lucide-react-native";
import { Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallmentBadge, nextToPay } from "../../components/domain/InstallmentStatus";
import { ErrorBanner } from "../../components/domain/ScreenState";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { whatsappUrl } from "../../constants/company";
import { RENTAL_STATUS, date, money } from "../../constants/format";
import { Colors, Radius, Spacing } from "../../constants/theme";
import { useLocatario } from "../../hooks/useLocatario";
import { API_URL } from "../../services/api";

export default function InicioScreen() {
  const router = useRouter();
  const { summary, activeRental, error, offline, refreshing, refresh } = useLocatario();
  if (!summary) return <SafeAreaView style={styles.safe}>{error ? <View style={styles.scroll}><ErrorBanner message={error} onRetry={refresh} /></View> : null}</SafeAreaView>;

  const first = summary.client.name.split(" ")[0];
  const installments = activeRental?.installments ?? [];
  const next = nextToPay(installments);
  const overdue = installments.filter((i) => !i.paid && i.late && i.proofStatus !== "pending_review");
  const inReview = installments.filter((i) => i.proofStatus === "pending_review").length;
  const rejected = installments.filter((i) => !i.paid && i.proofStatus === "rejected");
  const cnhDays = summary.client.cnhExpiry ? Math.round((Date.parse(summary.client.cnhExpiry) - Date.parse(summary.today)) / 86_400_000) : null;
  const status = activeRental ? RENTAL_STATUS[activeRental.status] : null;
  const support = summary.support;

  const alerts: { tone: "danger" | "warning" | "info"; text: string; action?: () => void }[] = [
    ...(overdue.length ? [{ tone: "danger" as const, text: `${overdue.length} pagamento(s) vencido(s): ${money(overdue.reduce((a, i) => a + i.total, 0))} com multa e juros.`, action: () => router.push("/(tabs)/pagamentos") }] : []),
    ...rejected.map((i) => ({ tone: "danger" as const, text: `Comprovante da parcela ${i.label || ""} recusado${i.rejectionReason ? `: ${i.rejectionReason}` : ""}. Envie de novo.`, action: () => router.push("/(tabs)/pagamentos") })),
    ...(inReview ? [{ tone: "info" as const, text: `${inReview} comprovante(s) em análise pela LOCAKAR.` }] : []),
    ...(cnhDays != null && cnhDays <= 30 ? [{ tone: cnhDays < 0 ? ("danger" as const) : ("warning" as const), text: cnhDays < 0 ? `Sua CNH venceu em ${date(summary.client.cnhExpiry)}. Toque para enviar a nova.` : `Sua CNH vence em ${date(summary.client.cnhExpiry)}. Toque para enviar a nova.`, action: () => router.push("/documentos") }] : []),
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.brandSoft} />}>
        <View>
          <Text style={styles.greeting}>Olá, {first}</Text>
          <Text style={styles.muted}>Sua locação na LOCAKAR</Text>
        </View>

        {error && <ErrorBanner message={offline ? "Sem internet: mostrando os dados salvos no celular." : error} onRetry={refresh} />}

        {alerts.map((a, i) => (
          <TouchableOpacity key={i} disabled={!a.action} onPress={a.action} style={[styles.alert, styles[`alert_${a.tone}`]]} accessibilityRole={a.action ? "button" : "text"}>
            <AlertTriangle color={a.tone === "info" ? Colors.info : a.tone === "warning" ? Colors.warning : Colors.danger} size={18} />
            <Text style={styles.alertText}>{a.text}</Text>
          </TouchableOpacity>
        ))}

        {activeRental ? (
          <Card accent style={{ padding: Spacing.lg, gap: Spacing.md }}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.carName}>{activeRental.vehicle?.name ?? "Veículo"}</Text>
                <Text style={styles.plate}>{activeRental.vehicle?.plate ?? "—"}</Text>
              </View>
              {status && <Badge label={status.label} tone={status.tone} />}
            </View>
            <Text style={styles.muted}>
              {date(activeRental.startDate)} a {date(activeRental.endDate)}
            </Text>
            <View style={styles.divider} />
            {next ? (
              <>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.label}>{next.late ? "Vencido em" : "Próximo vencimento"}</Text>
                    <Text style={styles.value}>{date(next.dueDate)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.label}>Valor hoje</Text>
                    <Text style={[styles.amount, next.late && { color: Colors.danger }]}>{money(next.total)}</Text>
                  </View>
                </View>
                <InstallmentBadge installment={next} />
                <Button label="Pagar com PIX" icon={<CreditCard color={Colors.text} size={18} />} onPress={() => router.push("/(tabs)/pagamentos")} />
              </>
            ) : (
              <Text style={styles.muted}>{inReview ? "Pagamentos em análise. Avisamos quando forem confirmados." : "Nenhum pagamento em aberto."}</Text>
            )}
          </Card>
        ) : summary.pendingRequest && summary.pendingRequest.status !== "approved" ? (
          <Card accent style={{ padding: Spacing.lg, gap: Spacing.md }}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={styles.carName}>{summary.pendingRequest.vehicleName}</Text>
                <Text style={styles.muted}>{summary.pendingRequest.vehicleCategory}</Text>
              </View>
              <Badge
                label={
                  summary.pendingRequest.status === "correction_requested"
                    ? "Ajuste solicitado"
                    : summary.pendingRequest.status === "rejected"
                    ? "Não aprovada"
                    : "Em análise"
                }
                tone={
                  summary.pendingRequest.status === "correction_requested"
                    ? "warning"
                    : summary.pendingRequest.status === "rejected"
                    ? "danger"
                    : "info"
                }
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.label}>Período solicitado</Text>
                <Text style={styles.value}>
                  {date(summary.pendingRequest.startDate)} a {date(summary.pendingRequest.endDate)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.label}>Plano previsto</Text>
                <Text style={styles.amount}>
                  {money(summary.pendingRequest.rateAmount)}
                  {summary.pendingRequest.planType === "daily" ? "/dia" : "/sem"}
                </Text>
              </View>
            </View>

            {summary.pendingRequest.status === "correction_requested" ? (
              <>
                <Text style={{ color: Colors.warning, fontSize: 13, lineHeight: 18 }}>
                  A LOCAKAR solicitou um ajuste na sua documentação: {summary.pendingRequest.correctionNotes}
                </Text>
                <Button label="Corrigir solicitação" onPress={() => router.push("/solicitar")} />
              </>
            ) : summary.pendingRequest.status === "rejected" ? (
              <>
                <Text style={{ color: Colors.danger, fontSize: 13, lineHeight: 18 }}>
                  Sua solicitação não foi aprovada: {summary.pendingRequest.rejectionReason}
                </Text>
                <Button label="Nova solicitação" variant="outline" onPress={() => router.push("/solicitar")} />
              </>
            ) : (
              <View style={{ gap: Spacing.xs }}>
                <Text style={styles.muted}>
                  Seus documentos foram recebidos e estão em análise pela nossa equipe. Assim que a locação for aprovada, você receberá uma notificação para assinar o contrato digital.
                </Text>
              </View>
            )}
          </Card>
        ) : (
          <Card style={{ padding: Spacing.lg, gap: Spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
              <Sparkles color={Colors.brandSoft} size={22} />
              <Text style={styles.carName}>Solicite sua locação</Text>
            </View>
            <Text style={styles.muted}>
              Alugue seu carro 100% digital, sem burocracia e com aprovação rápida. Escolha o veículo da frota e envie seus documentos em poucos passos.
            </Text>
            <Button
              label="Escolher veículo e solicitar"
              icon={<Car color={Colors.text} size={18} />}
              onPress={() => router.push("/solicitar")}
            />
          </Card>
        )}

        <View style={styles.grid}>
          {[
            { label: "Meu veículo", icon: <ClipboardCheck color={Colors.brandSoft} size={22} />, onPress: () => router.push("/veiculo") },
            { label: "Relatar problema", icon: <AlertTriangle color={Colors.danger} size={22} />, onPress: () => router.push("/ocorrencias") },
            { label: "Documentos", icon: <FileText color={Colors.info} size={22} />, onPress: () => router.push("/documentos") },
            { label: "Multas", icon: <TriangleAlert color={Colors.warning} size={22} />, onPress: () => router.push("/multas") },
            { label: "Reservas", icon: <CalendarDays color={Colors.success} size={22} />, onPress: () => router.push("/reservas") },
            { label: "Suporte", icon: <MessageCircle color={Colors.warning} size={22} />, onPress: () => Linking.openURL(whatsappUrl(support.whatsapp, "Olá, LOCAKAR! Preciso de ajuda com minha locação.")) },
          ].map((g) => (
            <TouchableOpacity key={g.label} style={styles.gridItem} onPress={g.onPress} accessibilityRole="button" accessibilityLabel={g.label}>
              {g.icon}
              <Text style={styles.gridLabel}>{g.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  greeting: { fontSize: 24, fontWeight: "700", color: Colors.text },
  muted: { fontSize: 13, color: Colors.textMuted },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: Spacing.sm },
  carName: { fontSize: 18, fontWeight: "700", color: Colors.text },
  plate: { fontSize: 13, color: Colors.brandSoft, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.border },
  label: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: "600", color: Colors.text, marginTop: 2 },
  amount: { fontSize: 20, fontWeight: "800", color: Colors.success, marginTop: 2 },
  alert: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start", padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  alert_danger: { borderColor: Colors.danger, backgroundColor: Colors.dangerSoft },
  alert_warning: { borderColor: Colors.warning, backgroundColor: Colors.warningSoft },
  alert_info: { borderColor: Colors.info, backgroundColor: Colors.infoSoft },
  alertText: { flex: 1, color: Colors.text, fontSize: 14, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  gridItem: { flexGrow: 1, flexBasis: "45%", backgroundColor: Colors.card, borderRadius: Radius.md, borderColor: Colors.border, borderWidth: 1, padding: Spacing.md, alignItems: "center", gap: Spacing.sm },
  gridLabel: { color: Colors.text, fontSize: 13, fontWeight: "600" },
});
