import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  Linking,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Car,
  CreditCard,
  FileCheck,
  AlertTriangle,
  MessageCircle,
  Clock,
  ShieldCheck,
  Wrench,
} from "lucide-react-native";
import { useLocatario } from "../../hooks/useLocatario";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Colors, Spacing, Radius } from "../../constants/theme";

export default function InicioScreen() {
  const router = useRouter();
  const { client, activeRental, loading, refresh } = useLocatario();

  const nextDue = activeRental?.receipts?.find((r) => !r.paid);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={Colors.brandSoft}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá, {client?.name ? client.name.split(" ")[0] : "Locatário"} 👋</Text>
            <Text style={styles.status}>Locatário Ativo · LOCAKAR</Text>
          </View>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>LOCAKAR</Text>
          </View>
        </View>

        {/* Card Destaque: Locação Ativa */}
        {activeRental ? (
          <Card accent style={styles.mainCard}>
            <View style={styles.mainCardHeader}>
              <View style={styles.carInfo}>
                <Text style={styles.carName}>{activeRental.vehicle?.name || "Veículo Locado"}</Text>
                <Text style={styles.plate}>{activeRental.vehicle?.plate || "—"}</Text>
              </View>
              <Badge
                label={activeRental.status === "active" ? "Em andamento" : activeRental.status === "late" ? "Com pendência" : "Locação"}
                tone={activeRental.status === "late" ? "danger" : "success"}
              />
            </View>

            <View style={styles.divider} />

            {/* Próximo vencimento */}
            {nextDue ? (
              <View style={styles.dueContainer}>
                <View>
                  <Text style={styles.dueLabel}>Próximo Vencimento</Text>
                  <Text style={styles.dueDate}>
                    {new Date(nextDue.dueDate).toLocaleDateString("pt-BR")}
                  </Text>
                </View>
                <View style={styles.dueValueBlock}>
                  <Text style={styles.dueLabel}>Valor</Text>
                  <Text style={styles.dueAmount}>
                    R$ {Number(nextDue.amount).toFixed(2).replace(".", ",")}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.noDueText}>Nenhum pagamento pendente no momento.</Text>
            )}

            <Button
              label="Pagar via PIX"
              icon={<CreditCard color={Colors.text} size={18} />}
              onPress={() => router.push("/(tabs)/pagamentos")}
              style={styles.btnPay}
            />
          </Card>
        ) : (
          <Card style={styles.emptyCard}>
            <Car color={Colors.textMuted} size={40} />
            <Text style={styles.emptyTitle}>Nenhuma locação ativa</Text>
            <Text style={styles.emptyText}>
              Fale com a nossa equipe para reservar um veículo da frota.
            </Text>
            <Button
              label="Falar no WhatsApp"
              variant="outline"
              icon={<MessageCircle color={Colors.text} size={18} />}
              onPress={() => Linking.openURL("https://wa.me/5519989615873")}
              style={{ marginTop: Spacing.sm }}
            />
          </Card>
        )}

        {/* Atalhos Rápidos */}
        <Text style={styles.sectionTitle}>Acesso Rápido</Text>
        <View style={styles.grid}>
          <TouchableOpacity
            style={styles.gridItem}
            activeOpacity={0.7}
            onPress={() => router.push("/(tabs)/locacao")}
          >
            <View style={[styles.gridIcon, { backgroundColor: "rgba(160,0,160,0.15)" }]}>
              <Car color={Colors.brandSoft} size={22} />
            </View>
            <Text style={styles.gridLabel}>Meu Veículo</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridItem}
            activeOpacity={0.7}
            onPress={() => router.push("/(tabs)/pagamentos")}
          >
            <View style={[styles.gridIcon, { backgroundColor: "rgba(16,185,129,0.15)" }]}>
              <CreditCard color={Colors.success} size={22} />
            </View>
            <Text style={styles.gridLabel}>Pagamentos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridItem}
            activeOpacity={0.7}
            onPress={() => router.push("/(tabs)/notificacoes")}
          >
            <View style={[styles.gridIcon, { backgroundColor: "rgba(59,130,246,0.15)" }]}>
              <FileCheck color={Colors.info} size={22} />
            </View>
            <Text style={styles.gridLabel}>Contratos</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.gridItem}
            activeOpacity={0.7}
            onPress={() => Linking.openURL("https://wa.me/5519989615873")}
          >
            <View style={[styles.gridIcon, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
              <MessageCircle color={Colors.warning} size={22} />
            </View>
            <Text style={styles.gridLabel}>Suporte</Text>
          </TouchableOpacity>
        </View>

        {/* Segurança e Suporte */}
        <Card style={styles.supportCard}>
          <View style={styles.supportRow}>
            <ShieldCheck color={Colors.brandSoft} size={24} />
            <View style={{ flex: 1 }}>
              <Text style={styles.supportTitle}>Atendimento 24h para Sinistros</Text>
              <Text style={styles.supportDesc}>
                Em caso de colisão, pane ou avaria, acione o suporte imediatamente.
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  greeting: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
  },
  status: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  brandBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderColor: Colors.borderStrong,
    borderWidth: 1,
  },
  brandBadgeText: {
    color: Colors.brandSoft,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  mainCard: {
    padding: Spacing.lg,
  },
  mainCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  carInfo: {
    gap: 2,
  },
  carName: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
  },
  plate: {
    fontSize: 13,
    color: Colors.brandSoft,
    fontWeight: "700",
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  dueContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  dueLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dueDate: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    marginTop: 2,
  },
  dueValueBlock: {
    alignItems: "flex-end",
  },
  dueAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.success,
    marginTop: 2,
  },
  noDueText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginBottom: Spacing.md,
  },
  btnPay: {
    marginTop: Spacing.xs,
  },
  emptyCard: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: Spacing.sm,
  },
  grid: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  gridItem: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderColor: Colors.border,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  gridIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  gridLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  supportCard: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surface,
  },
  supportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  supportTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  supportDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
