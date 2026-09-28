import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CreditCard, QrCode, Copy, Check, X, AlertTriangle } from "lucide-react-native";
import { useLocatario } from "../../hooks/useLocatario";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Colors, Spacing, Radius } from "../../constants/theme";

export default function PagamentosScreen() {
  const { activeRental, loading, refresh } = useLocatario();
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const handleCopyPix = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
    Alert.alert("Código copiado!", "Cole no app do seu banco na opção 'PIX Copia e Cola'.");
  };

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
        <Text style={styles.title}>Meus Pagamentos</Text>
        <Text style={styles.subtitle}>Parcelas da sua locação e cobranças em aberto.</Text>

        {activeRental?.receipts?.length ? (
          <View style={styles.receiptList}>
            {activeRental.receipts.map((r, i) => {
              const isLate = !r.paid && r.dueDate < today;
              return (
                <Card key={r.id} style={styles.receiptCard}>
                  <View style={styles.receiptRow}>
                    <View>
                      <Text style={styles.receiptIndex}>Parcela #{i + 1}</Text>
                      <Text style={styles.receiptDate}>
                        Vencimento: {new Date(r.dueDate).toLocaleDateString("pt-BR")}
                      </Text>
                    </View>
                    <Badge
                      label={r.paid ? "Pago" : isLate ? "Atrasado" : "Em Aberto"}
                      tone={r.paid ? "success" : isLate ? "danger" : "warning"}
                    />
                  </View>

                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Valor:</Text>
                    <Text style={[styles.amountValue, r.paid && { color: Colors.textMuted }]}>
                      R$ {r.amount.toFixed(2).replace(".", ",")}
                    </Text>
                  </View>

                  {!r.paid && (
                    <Button
                      label="Pagar com PIX"
                      icon={<QrCode color={Colors.text} size={16} />}
                      size="sm"
                      onPress={() => setSelectedReceipt(r)}
                      style={{ marginTop: Spacing.sm }}
                    />
                  )}
                </Card>
              );
            })}
          </View>
        ) : (
          <Card style={styles.emptyCard}>
            <CreditCard color={Colors.textMuted} size={48} />
            <Text style={styles.emptyTitle}>Nenhuma cobrança disponível</Text>
            <Text style={styles.emptyText}>
              Assim que sua locação for confirmada, as parcelas serão listadas aqui.
            </Text>
          </Card>
        )}
      </ScrollView>

      {/* Modal PIX Copia e Cola */}
      <Modal
        visible={!!selectedReceipt}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedReceipt(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pagamento via PIX</Text>
              <TouchableOpacity onPress={() => setSelectedReceipt(null)}>
                <X color={Colors.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            {selectedReceipt && (
              <View style={styles.modalBody}>
                <Text style={styles.modalValueLabel}>Total a pagar</Text>
                <Text style={styles.modalValue}>
                  R$ {selectedReceipt.amount.toFixed(2).replace(".", ",")}
                </Text>
                <Text style={styles.modalHint}>
                  Vencimento em {new Date(selectedReceipt.dueDate).toLocaleDateString("pt-BR")}
                </Text>

                {/* Caixa Copia e Cola */}
                <View style={styles.copyBox}>
                  <Text style={styles.copyText} numberOfLines={2}>
                    00020126360014br.gov.bcb.pix0114+5519989615873520400005303986540...
                  </Text>
                </View>

                <Button
                  label={copied ? "Código Copiado!" : "Copiar Código PIX"}
                  icon={copied ? <Check color={Colors.text} size={18} /> : <Copy color={Colors.text} size={18} />}
                  onPress={handleCopyPix}
                />

                <Button
                  label="Já paguei (Enviar Comprovante)"
                  variant="outline"
                  onPress={() => {
                    setSelectedReceipt(null);
                    Alert.alert(
                      "Enviar Comprovante",
                      "O envio de comprovante via Câmera/Galeria com aprovação do Admin está disponível na aba de Vistorias e Comprovantes."
                    );
                  }}
                  style={{ marginTop: Spacing.xs }}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  title: { fontSize: 24, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: -8, marginBottom: Spacing.sm },
  receiptList: { gap: Spacing.sm },
  receiptCard: { padding: Spacing.md },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  receiptIndex: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  receiptDate: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: Spacing.sm },
  amountLabel: { color: Colors.textMuted, fontSize: 13 },
  amountValue: { color: Colors.success, fontSize: 16, fontWeight: "800" },
  emptyCard: { alignItems: "center", padding: Spacing.xl, gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.xl, borderColor: Colors.border, borderTopWidth: 1 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.lg },
  modalTitle: { color: Colors.text, fontSize: 18, fontWeight: "700" },
  modalBody: { alignItems: "center", gap: Spacing.sm },
  modalValueLabel: { color: Colors.textMuted, fontSize: 12, textTransform: "uppercase" },
  modalValue: { color: Colors.success, fontSize: 28, fontWeight: "900" },
  modalHint: { color: Colors.textMuted, fontSize: 13, marginBottom: Spacing.md },
  copyBox: { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, width: "100%", marginBottom: Spacing.sm },
  copyText: { color: Colors.textMuted, fontFamily: "monospace", fontSize: 12 },
});
