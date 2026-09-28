import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bell, CheckCircle2, AlertCircle, Info, Calendar } from "lucide-react-native";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Colors, Spacing } from "../../constants/theme";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  date: string;
  read: boolean;
  type: "payment" | "alert" | "info";
}

export default function NotificacoesScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: "1",
      title: "Contrato Ativo",
      body: "Seu contrato de locação está ativo e disponível para consulta.",
      date: new Date().toLocaleDateString("pt-BR"),
      read: false,
      type: "info",
    },
    {
      id: "2",
      title: "Lembrete de Pagamento",
      body: "Mantenha seus pagamentos semanais em dia para evitar juros e multas.",
      date: new Date().toLocaleDateString("pt-BR"),
      read: true,
      type: "payment",
    },
  ]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.brandSoft}
          />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Notificações</Text>
            <Text style={styles.subtitle}>Comunicados e alertas da sua locação.</Text>
          </View>
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.btnReadAll}>Marcar lidas</Text>
          </TouchableOpacity>
        </View>

        {notifications.length ? (
          <View style={styles.list}>
            {notifications.map((n) => (
              <Card
                key={n.id}
                style={[styles.itemCard, !n.read && styles.itemUnread]}
              >
                <View style={styles.itemRow}>
                  <View style={styles.iconCol}>
                    {n.type === "payment" ? (
                      <CheckCircle2 color={Colors.success} size={20} />
                    ) : n.type === "alert" ? (
                      <AlertCircle color={Colors.warning} size={20} />
                    ) : (
                      <Info color={Colors.info} size={20} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.itemTitle, !n.read && styles.itemTitleBold]}>
                        {n.title}
                      </Text>
                      <Text style={styles.itemDate}>{n.date}</Text>
                    </View>
                    <Text style={styles.itemBody}>{n.body}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <Card style={styles.emptyCard}>
            <Bell color={Colors.textMuted} size={48} />
            <Text style={styles.emptyTitle}>Tudo em dia!</Text>
            <Text style={styles.emptyText}>Você não possui notificações pendentes.</Text>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  title: { fontSize: 24, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  btnReadAll: { color: Colors.brandSoft, fontSize: 13, fontWeight: "600" },
  list: { gap: Spacing.sm },
  itemCard: { padding: Spacing.md },
  itemUnread: { borderColor: Colors.brandGlow, backgroundColor: "#150A19" },
  itemRow: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start" },
  iconCol: { marginTop: 2 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  itemTitle: { color: Colors.text, fontSize: 14, fontWeight: "600" },
  itemTitleBold: { fontWeight: "800", color: Colors.text },
  itemDate: { color: Colors.textSubtle, fontSize: 11 },
  itemBody: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  emptyCard: { alignItems: "center", padding: Spacing.xl, gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: "center" },
});
