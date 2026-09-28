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
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CreditCard, QrCode, Copy, Check, X, Camera, Image as ImageIcon, Clock } from "lucide-react-native";
import { useLocatario } from "../../hooks/useLocatario";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Colors, Spacing, Radius } from "../../constants/theme";
import { pickProofImage, uploadPaymentProof } from "../../services/paymentProof";

export default function PagamentosScreen() {
  const { activeRental, client, loading, refresh } = useLocatario();
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Estado do envio de comprovante
  const [proofImageUri, setProofImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const handleCopyPix = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
    Alert.alert("Código copiado!", "Cole no app do seu banco na opção 'PIX Copia e Cola'.");
  };

  const handlePickProof = async (source: "camera" | "gallery") => {
    try {
      const uri = await pickProofImage(source);
      if (uri) {
        setProofImageUri(uri);
      }
    } catch (e: any) {
      Alert.alert("Erro", e.message || "Não foi possível selecionar a imagem.");
    }
  };

  const handleSendProof = async () => {
    if (!proofImageUri || !client || !activeRental || !selectedReceipt) return;

    setUploading(true);
    const result = await uploadPaymentProof(
      client.id,
      activeRental.id,
      selectedReceipt.id,
      proofImageUri,
      selectedReceipt.amount
    );
    setUploading(false);

    if (result.success) {
      Alert.alert(
        "Comprovante enviado!",
        "O pagamento entrará em análise e será aprovado pela equipe da LOCAKAR. Você receberá um aviso assim que for confirmado.",
        [
          {
            text: "Entendido",
            onPress: () => {
              setProofImageUri(null);
              setSelectedReceipt(null);
              refresh();
            },
          },
        ]
      );
    } else {
      Alert.alert("Erro no envio", result.error || "Não foi possível enviar o comprovante. Tente novamente.");
    }
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
                      onPress={() => {
                        setProofImageUri(null);
                        setSelectedReceipt(r);
                      }}
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

      {/* Modal de Pagamento PIX e Upload de Comprovante */}
      <Modal
        visible={!!selectedReceipt}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!uploading) {
            setSelectedReceipt(null);
            setProofImageUri(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {proofImageUri ? "Enviar Comprovante" : "Pagamento via PIX"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSelectedReceipt(null);
                  setProofImageUri(null);
                }}
                disabled={uploading}
              >
                <X color={Colors.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            {selectedReceipt && !proofImageUri && (
              <View style={styles.modalBody}>
                <Text style={styles.modalValueLabel}>Total a pagar</Text>
                <Text style={styles.modalValue}>
                  R$ {selectedReceipt.amount.toFixed(2).replace(".", ",")}
                </Text>
                <Text style={styles.modalHint}>
                  Vencimento em {new Date(selectedReceipt.dueDate).toLocaleDateString("pt-BR")}
                </Text>

                {/* Código Copia e Cola */}
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

                {/* Seção Já paguei */}
                <View style={styles.proofSection}>
                  <Text style={styles.proofSectionTitle}>Já fez o pagamento?</Text>
                  <Text style={styles.proofSectionSubtitle}>
                    Anexe o comprovante para que o Admin aprove sua parcela.
                  </Text>
                  <View style={styles.pickButtonsRow}>
                    <Button
                      label="Tirar Foto"
                      variant="outline"
                      size="sm"
                      icon={<Camera color={Colors.text} size={16} />}
                      onPress={() => handlePickProof("camera")}
                      style={{ flex: 1 }}
                    />
                    <Button
                      label="Galeria"
                      variant="outline"
                      size="sm"
                      icon={<ImageIcon color={Colors.text} size={16} />}
                      onPress={() => handlePickProof("gallery")}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              </View>
            )}

            {/* Prévia da imagem selecionada e botão de envio */}
            {selectedReceipt && proofImageUri && (
              <View style={styles.previewContainer}>
                <Image source={{ uri: proofImageUri }} style={styles.proofPreview} />
                <Text style={styles.previewHint}>
                  Confirme se os dados da transferência (valor, data e destinatário) estão legíveis.
                </Text>

                <Button
                  label="Confirmar e Enviar Comprovante"
                  loading={uploading}
                  onPress={handleSendProof}
                  style={{ width: "100%", marginTop: Spacing.sm }}
                />

                <Button
                  label="Escolher Outra Foto"
                  variant="ghost"
                  disabled={uploading}
                  onPress={() => setProofImageUri(null)}
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
  modalBody: { alignItems: "center", gap: Spacing.sm, width: "100%" },
  modalValueLabel: { color: Colors.textMuted, fontSize: 12, textTransform: "uppercase" },
  modalValue: { color: Colors.success, fontSize: 28, fontWeight: "900" },
  modalHint: { color: Colors.textMuted, fontSize: 13, marginBottom: Spacing.md },
  copyBox: { backgroundColor: Colors.card, borderColor: Colors.border, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, width: "100%", marginBottom: Spacing.sm },
  copyText: { color: Colors.textMuted, fontFamily: "monospace", fontSize: 12 },
  proofSection: { width: "100%", marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopColor: Colors.border, borderTopWidth: 1, alignItems: "center" },
  proofSectionTitle: { color: Colors.text, fontSize: 14, fontWeight: "700", marginBottom: 2 },
  proofSectionSubtitle: { color: Colors.textMuted, fontSize: 12, textAlign: "center", marginBottom: Spacing.md },
  pickButtonsRow: { flexDirection: "row", gap: Spacing.sm, width: "100%" },
  previewContainer: { alignItems: "center", width: "100%" },
  proofPreview: { width: "100%", height: 260, borderRadius: Radius.md, resizeMode: "contain", backgroundColor: Colors.card },
  previewHint: { color: Colors.textMuted, fontSize: 12, textAlign: "center", marginTop: Spacing.sm },
});
