import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Car,
  FileText,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Wrench,
  ShieldAlert,
} from "lucide-react-native";
import { useLocatario } from "../../hooks/useLocatario";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Colors, Spacing, Radius } from "../../constants/theme";

export default function LocacaoScreen() {
  const { rentals, activeRental, loading, refresh } = useLocatario();

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
        <Text style={styles.title}>Minha Locação</Text>
        <Text style={styles.subtitle}>Detalhes do contrato, veículo e histórico.</Text>

        {activeRental ? (
          <>
            {/* Veículo */}
            <Card style={styles.sectionCard}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                  <Car color={Colors.brandSoft} size={20} />
                  <Text style={styles.cardTitle}>Veículo Atual</Text>
                </View>
                <Badge label="Em Uso" tone="success" />
              </View>

              <View style={styles.vehicleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleName}>{activeRental.vehicle?.name || "Carro"}</Text>
                  <Text style={styles.vehiclePlate}>{activeRental.vehicle?.plate || "—"}</Text>
                  <Text style={styles.vehicleFuel}>Combustível: {activeRental.vehicle?.fuel || "Flex"}</Text>
                </View>
              </View>
            </Card>

            {/* Dados do Contrato */}
            <Card style={styles.sectionCard}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                  <FileText color={Colors.brandSoft} size={20} />
                  <Text style={styles.cardTitle}>Dados do Contrato</Text>
                </View>
                <Badge label={activeRental.status.toUpperCase()} tone="brand" />
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Início</Text>
                  <Text style={styles.infoVal}>
                    {new Date(activeRental.startDate).toLocaleDateString("pt-BR")}
                  </Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Devolução Prevista</Text>
                  <Text style={styles.infoVal}>
                    {new Date(activeRental.endDate).toLocaleDateString("pt-BR")}
                  </Text>
                </View>
                <View style={styles.infoCol}>
                  <Text style={styles.infoLabel}>Valor por Parcela</Text>
                  <Text style={styles.infoVal}>
                    R$ {activeRental.weeklyRate.toFixed(2).replace(".", ",")}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Ações operacionais */}
            <View style={styles.actionRow}>
              <Button
                label="Reportar Problema"
                variant="outline"
                icon={<ShieldAlert color={Colors.text} size={18} />}
                onPress={() => Alert.alert("Ocorrência", "Abra a ocorrência descrevendo o problema mecânico ou sinistro.")}
                style={{ flex: 1 }}
              />
              <Button
                label="Agendar Revisão"
                variant="secondary"
                icon={<Wrench color={Colors.brandSoft} size={18} />}
                onPress={() => Alert.alert("Manutenção", "Fale com nosso setor técnico para agendamento de revisão preventiva.")}
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <Card style={styles.emptyCard}>
            <Car color={Colors.textMuted} size={48} />
            <Text style={styles.emptyTitle}>Sem locações registradas</Text>
            <Text style={styles.emptyText}>
              Seus contratos aparecerão aqui assim que forem emitidos pela LOCAKAR.
            </Text>
          </Card>
        )}

        {/* Histórico */}
        {rentals.length > 1 && (
          <View style={{ marginTop: Spacing.lg }}>
            <Text style={styles.sectionHeader}>Histórico de Locações</Text>
            {rentals.map((r, i) => (
              <Card key={r.id} style={{ marginTop: Spacing.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: Colors.text, fontWeight: "700" }}>Locação #{i + 1}</Text>
                  <Badge label={r.status} tone={r.status === "finished" ? "neutral" : "warning"} />
                </View>
                <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 4 }}>
                  {new Date(r.startDate).toLocaleDateString("pt-BR")} até {new Date(r.endDate).toLocaleDateString("pt-BR")}
                </Text>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  title: { fontSize: 24, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: -8, marginBottom: Spacing.sm },
  sectionCard: { padding: Spacing.md },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  vehicleRow: { flexDirection: "row", justifyContent: "space-between" },
  vehicleName: { color: Colors.text, fontSize: 17, fontWeight: "700" },
  vehiclePlate: { color: Colors.brandSoft, fontSize: 13, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  vehicleFuel: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
  infoCol: { minWidth: 120 },
  infoLabel: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase" },
  infoVal: { fontSize: 14, fontWeight: "600", color: Colors.text, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: Spacing.sm },
  emptyCard: { alignItems: "center", padding: Spacing.xl, gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: "center" },
  sectionHeader: { fontSize: 14, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
});
