import { useRouter } from "expo-router";
import { BadgeAlert, CalendarDays, CarFront, CircleAlert, CreditCard, FileText, Info, MessageCircle, Sparkles, TriangleAlert } from "lucide-react-native";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { InstallmentBadge, nextToPay } from "../../components/domain/InstallmentStatus";
import { InfoTile, PLAN_UNIT, QuickAction, RentalStatusCard, StatusNote } from "../../components/domain/HomeCards";
import { SkeletonList } from "../../components/domain/Screen";
import { ErrorBanner } from "../../components/domain/ScreenState";
import { SectionHeader, TenantPage } from "../../components/layout/TenantPage";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { whatsappUrl } from "../../constants/company";
import { RENTAL_STATUS, date, money } from "../../constants/format";
import { Radius, Spacing, Type, type ThemeColors } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import { useLayout } from "../../hooks/useLayout";
import { useLocatario } from "../../hooks/useLocatario";
import { API_URL } from "../../services/api";
import { useBrandName } from "../../context/OrgProvider";

const REQUEST_STATUS = {
  pending: { label: "Em análise", tone: "info" as const },
  correction_requested: { label: "Ajuste solicitado", tone: "warning" as const },
  rejected: { label: "Não aprovada", tone: "danger" as const },
  approved: { label: "Aprovada", tone: "success" as const },
};

const imageUrl = (img?: string | null) => (img ? (img.startsWith("http") ? img : `${API_URL}${img}`) : null);

export default function InicioScreen() {
  const brandName = useBrandName();
  const { colors: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { isDesktop, isTablet } = useLayout();
  const { summary, activeRental, error, offline, refreshing, refresh } = useLocatario();

  if (!summary) {
    return <TenantPage showBrand>{error ? <ErrorBanner message={error} onRetry={refresh} /> : <SkeletonList />}</TenantPage>;
  }

  const first = summary.client.name.split(" ")[0];
  const installments = activeRental?.installments ?? [];
  const next = nextToPay(installments);
  const overdue = installments.filter((i) => !i.paid && i.late && i.proofStatus !== "pending_review");
  const inReview = installments.filter((i) => i.proofStatus === "pending_review").length;
  const rejected = installments.filter((i) => !i.paid && i.proofStatus === "rejected");
  const cnhDays = summary.client.cnhExpiry ? Math.round((Date.parse(summary.client.cnhExpiry) - Date.parse(summary.today)) / 86_400_000) : null;
  const status = activeRental ? RENTAL_STATUS[activeRental.status] : null;
  const request = !activeRental && summary.pendingRequest && summary.pendingRequest.status !== "approved" ? summary.pendingRequest : null;
  const vehicle = activeRental?.vehicle ?? null;
  const support = () => Linking.openURL(whatsappUrl(summary.support.whatsapp, `Olá, ${brandName}! Preciso de ajuda com minha locação.`));

  const alerts: { tone: "danger" | "warning" | "info"; text: string; action?: () => void }[] = [
    ...(overdue.length ? [{ tone: "danger" as const, text: `${overdue.length} pagamento(s) vencido(s): ${money(overdue.reduce((a, i) => a + i.total, 0))} com multa e juros.`, action: () => router.push("/(tabs)/pagamentos") }] : []),
    ...rejected.map((i) => ({ tone: "danger" as const, text: `Comprovante da parcela ${i.label || ""} recusado${i.rejectionReason ? `: ${i.rejectionReason}` : ""}. Envie de novo.`, action: () => router.push("/(tabs)/pagamentos") })),
    ...(inReview ? [{ tone: "info" as const, text: `${inReview} comprovante(s) em análise pela ${brandName}.` }] : []),
    ...(cnhDays != null && cnhDays <= 30 ? [{ tone: cnhDays < 0 ? ("danger" as const) : ("warning" as const), text: cnhDays < 0 ? `Sua CNH venceu em ${date(summary.client.cnhExpiry)}. Toque para enviar a nova.` : `Sua CNH vence em ${date(summary.client.cnhExpiry)}. Toque para enviar a nova.`, action: () => router.push("/documentos") }] : []),
  ];

  const actions = [
    { icon: CarFront, label: "Meu veículo", detail: vehicle ? `${vehicle.name} · ${vehicle.plate}` : undefined, onPress: () => router.push("/veiculo") },
    { icon: TriangleAlert, label: "Relatar problema", detail: "Pane, pneu, acidente", onPress: () => router.push("/ocorrencias"), tone: "danger" as const },
    { icon: FileText, label: "Documentos", detail: "CNH e comprovantes", onPress: () => router.push("/documentos") },
    { icon: BadgeAlert, label: "Multas", onPress: () => router.push("/multas") },
    { icon: CalendarDays, label: "Reservas", onPress: () => router.push("/reservas") },
    { icon: MessageCircle, label: "Suporte", detail: summary.support.display ?? undefined, onPress: support },
  ];
  const actionBasis = isDesktop ? "31%" : isTablet ? "31%" : "46%";

  // Card principal: locação ativa → solicitação em andamento → convite para solicitar.
  const hero = activeRental ? (
    <RentalStatusCard
      title={vehicle?.name ?? "Veículo"}
      subtitle={vehicle?.plate}
      image={imageUrl(vehicle?.image)}
      status={status ?? undefined}
      period={{ from: activeRental.startDate, to: activeRental.endDate }}
      amountLabel={next ? (next.late ? "Vencido — valor hoje" : `Próximo · ${date(next.dueDate)}`) : undefined}
      amount={next ? money(next.total) : undefined}
      amountTone={next?.late ? "danger" : undefined}
    >
      {next ? (
        <View style={styles.heroFooter}>
          <InstallmentBadge installment={next} />
          <Button label="Pagar com PIX" icon={<CreditCard color={Colors.text} size={18} />} onPress={() => router.push("/(tabs)/pagamentos")} style={styles.heroButton} />
        </View>
      ) : (
        <StatusNote title="Pagamentos" text={inReview ? "Pagamentos em análise. Avisamos quando forem confirmados." : "Nenhum pagamento em aberto."} />
      )}
    </RentalStatusCard>
  ) : request ? (
    <RentalStatusCard
      title={request.vehicleName}
      subtitle={request.vehicleCategory}
      image={imageUrl(request.vehicleImage)}
      status={REQUEST_STATUS[request.status]}
      period={{ from: request.startDate, to: request.endDate }}
      amountLabel="Plano previsto"
      amount={money(request.rateAmount)}
      amountUnit={PLAN_UNIT[request.planType] ?? ""}
    >
      {request.status === "correction_requested" ? (
        <>
          <StatusNote title="Ajuste solicitado" tone="warning" text={`A ${brandName} pediu um ajuste na sua documentação: ${request.correctionNotes ?? ""}`} />
          <Button label="Corrigir solicitação" onPress={() => router.push("/solicitar")} />
        </>
      ) : request.status === "rejected" ? (
        <>
          <StatusNote title="Resultado" tone="danger" text={`Sua solicitação não foi aprovada: ${request.rejectionReason ?? ""}`} />
          <Button label="Nova solicitação" variant="outline" onPress={() => router.push("/solicitar")} />
        </>
      ) : (
        <StatusNote
          title="Status da solicitação"
          text="Seus documentos foram recebidos e estão em análise pela nossa equipe. Assim que a locação for aprovada, você receberá uma notificação para assinar o contrato digital."
        />
      )}
    </RentalStatusCard>
  ) : (
    <Card accent style={{ padding: Spacing.lg, gap: Spacing.md }}>
      <View style={styles.inviteHead}>
        <View style={styles.inviteIcon}>
          <Sparkles color={Colors.brandSoft} size={20} />
        </View>
        <Text style={styles.inviteTitle}>Solicite sua locação</Text>
      </View>
      <Text style={styles.body}>Alugue 100% digital, sem burocracia e com aprovação rápida. Escolha o veículo da frota e envie seus documentos em poucos passos.</Text>
      <Button label="Escolher veículo e solicitar" icon={<CarFront color={Colors.text} size={18} />} onPress={() => router.push("/solicitar")} style={styles.heroButton} />
    </Card>
  );

  const vehicleCard = vehicle && (
    <Card onPress={() => router.push("/veiculo")} accessibilityLabel={`Meu veículo: ${vehicle.name}`} style={{ gap: Spacing.md }}>
      <SectionHeader title="Meu veículo" />
      <View style={styles.tiles}>
        <InfoTile label="Placa" value={vehicle.plate} />
        <InfoTile label="Ano" value={vehicle.yearModel ? `${vehicle.year}/${vehicle.yearModel}` : String(vehicle.year)} />
        {activeRental?.kmStart != null && <InfoTile label="Km na retirada" value={`${activeRental.kmStart.toLocaleString("pt-BR")} km`} />}
        <InfoTile label="Câmbio" value={vehicle.transmission} />
      </View>
      <Text style={styles.link}>Ver veículo e vistorias</Text>
    </Card>
  );

  return (
    <TenantPage showBrand refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.greetingBlock}>
        <Text style={[styles.greeting, isDesktop && styles.greetingDesktop]} accessibilityRole="header">
          Olá, {first}
        </Text>
        <Text style={styles.greetingSub}>Sua locação na {brandName}</Text>
      </View>

      {error && <ErrorBanner message={offline ? "Sem internet: mostrando os dados salvos no celular." : error} onRetry={refresh} />}

      {alerts.map((a, i) => (
        <Pressable
          key={i}
          disabled={!a.action}
          onPress={a.action}
          style={({ pressed }) => [styles.alert, styles[`alert_${a.tone}`], pressed && { opacity: 0.85 }]}
          accessibilityRole={a.action ? "button" : "text"}
        >
          {a.tone === "info" ? <Info color={Colors.info} size={18} /> : <CircleAlert color={a.tone === "warning" ? Colors.warning : Colors.danger} size={18} />}
          <Text style={styles.alertText}>{a.text}</Text>
        </Pressable>
      ))}

      {isDesktop && vehicleCard ? (
        <View style={styles.split}>
          <View style={{ flex: 3, minWidth: 0 }}>{hero}</View>
          <View style={{ flex: 2, minWidth: 0 }}>{vehicleCard}</View>
        </View>
      ) : (
        <>
          {hero}
          {vehicleCard}
        </>
      )}

      <SectionHeader title="Acesso rápido" />
      <View style={styles.grid}>
        {actions.map((a) => (
          <View key={a.label} style={{ flexBasis: actionBasis, flexGrow: 1, minWidth: 0 }}>
            <QuickAction icon={a.icon} label={a.label} detail={isDesktop || isTablet ? a.detail : undefined} onPress={a.onPress} tone={a.tone} compact={!isDesktop && !isTablet} />
          </View>
        ))}
      </View>
    </TenantPage>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
  greetingBlock: { gap: 2, marginTop: Spacing.xs },
  greeting: { ...Type.title, fontSize: 24, lineHeight: 30, color: Colors.text },
  greetingDesktop: { ...Type.display },
  greetingSub: { ...Type.small, color: Colors.textMuted },
  body: { ...Type.body, color: Colors.textSecondary, maxWidth: 560 },
  heroFooter: { gap: Spacing.s12 },
  heroButton: { alignSelf: "stretch" },
  inviteHead: { flexDirection: "row", alignItems: "center", gap: Spacing.s12 },
  inviteIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: "center", justifyContent: "center", backgroundColor: Colors.brandTint },
  inviteTitle: { ...Type.title, color: Colors.text, flex: 1 },
  tiles: { flexDirection: "row", flexWrap: "wrap", rowGap: Spacing.md, columnGap: Spacing.md },
  link: { fontSize: 13, fontWeight: "600", color: Colors.brandSoft },
  split: { flexDirection: "row", gap: Spacing.lg, alignItems: "stretch" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.s12 },
  alert: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start", padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  alert_danger: { borderColor: Colors.dangerBorder, backgroundColor: Colors.dangerSoft },
  alert_warning: { borderColor: Colors.warningBorder, backgroundColor: Colors.warningSoft },
  alert_info: { borderColor: Colors.infoBorder, backgroundColor: Colors.infoSoft },
  alertText: { ...Type.small, flex: 1, color: Colors.text },
});
