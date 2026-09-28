import * as Clipboard from "expo-clipboard";
import { Camera, Check, Copy, CreditCard, Image as ImageIcon, X } from "lucide-react-native";
import { useState } from "react";
import { Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { InstallmentBadge } from "../../components/domain/InstallmentStatus";
import { ErrorBanner } from "../../components/domain/ScreenState";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { date, money } from "../../constants/format";
import { Colors, Radius, Spacing } from "../../constants/theme";
import { useLocatario } from "../../hooks/useLocatario";
import type { Installment } from "../../services/api";
import { pickProofImage, sendPaymentProof } from "../../services/paymentProof";

type Step = "pix" | "proof" | "sent";

export default function PagamentosScreen() {
  const { summary, activeRental, error, refreshing, refresh } = useLocatario();
  const [open, setOpen] = useState<Installment | null>(null);
  const [step, setStep] = useState<Step>("pix");
  const [copied, setCopied] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const installments = activeRental?.installments ?? [];

  const openInstallment = (i: Installment) => {
    setOpen(i);
    setStep("pix");
    setImage(null);
    setMessage(null);
    setCopied(false);
  };
  const close = () => !sending && setOpen(null);

  const copy = async () => {
    if (!open?.pixCode) return;
    await Clipboard.setStringAsync(open.pixCode);
    setCopied(true);
  };

  const pick = async (source: "camera" | "gallery") => {
    setMessage(null);
    try {
      const uri = await pickProofImage(source);
      if (uri) {
        setImage(uri);
        setStep("proof");
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const send = async () => {
    if (!open || !image || !summary || !activeRental) return;
    setSending(true);
    setMessage(null);
    try {
      await sendPaymentProof({ clientId: summary.client.id, rentalId: activeRental.id, installmentId: open.id, imageUri: image });
      setStep("sent");
      refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
    setSending(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.brandSoft} />}>
        <Text style={styles.title}>Pagamentos</Text>
        {error && <ErrorBanner message={error} onRetry={refresh} />}

        {installments.length === 0 ? (
          <Card style={{ alignItems: "center", padding: Spacing.xl, gap: Spacing.sm }}>
            <CreditCard color={Colors.textMuted} size={40} />
            <Text style={styles.cardTitle}>Nenhuma parcela</Text>
            <Text style={[styles.muted, { textAlign: "center" }]}>As parcelas da sua locação aparecem aqui.</Text>
          </Card>
        ) : (
          installments.map((i) => (
            <Card key={i.id} style={{ gap: Spacing.sm }}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{i.label || "Parcela"}</Text>
                  <Text style={styles.muted}>Vencimento {date(i.dueDate)}</Text>
                </View>
                <InstallmentBadge installment={i} />
              </View>
              <View style={styles.rowBetween}>
                <Text style={styles.muted}>{i.paid ? `Pago em ${date(i.paidAt)}` : i.late && i.total > i.amount ? `Parcela ${money(i.amount)} + multa e juros` : "Valor"}</Text>
                <Text style={[styles.amount, i.paid && { color: Colors.textMuted }, !i.paid && i.late && { color: Colors.danger }]}>{money(i.paid ? (i.amountPaid ?? i.amount) : i.total)}</Text>
              </View>
              {i.proofStatus === "rejected" && !i.paid && i.rejectionReason && <Text style={styles.rejected}>Motivo da recusa: {i.rejectionReason}</Text>}
              {!i.paid && i.proofStatus !== "pending_review" && (
                <Button label={i.proofStatus === "rejected" ? "Pagar ou reenviar comprovante" : "Pagar com PIX"} size="sm" onPress={() => openInstallment(i)} />
              )}
            </Card>
          ))
        )}
      </ScrollView>

      <Modal visible={!!open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.sheetTitle}>{step === "sent" ? "Comprovante enviado" : step === "proof" ? "Confira o comprovante" : "Pagar com PIX"}</Text>
              <TouchableOpacity onPress={close} disabled={sending} accessibilityRole="button" accessibilityLabel="Fechar">
                <X color={Colors.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.md, paddingTop: Spacing.md }}>
              {open && step === "pix" && (
                <>
                  <View style={{ alignItems: "center", gap: 4 }}>
                    <Text style={styles.label}>Total a pagar hoje</Text>
                    <Text style={styles.total}>{money(open.total)}</Text>
                    <Text style={styles.muted}>
                      {open.label} · vencimento {date(open.dueDate)}
                    </Text>
                    {open.fee + open.interest > 0 && (
                      <Text style={styles.muted}>
                        Parcela {money(open.amount)} + multa {money(open.fee)} + juros {money(open.interest)}
                      </Text>
                    )}
                  </View>

                  {open.pixCode ? (
                    <>
                      <View style={styles.qr} accessibilityLabel={`QR Code PIX de ${money(open.total)}`}>
                        <QRCode value={open.pixCode} size={200} backgroundColor="#FFFFFF" color="#000000" />
                      </View>
                      <Text style={[styles.muted, { textAlign: "center" }]}>
                        Leia o QR Code no app do seu banco ou copie o código.{summary?.pix?.name ? ` Recebedor: ${summary.pix.name}.` : ""}
                      </Text>
                      <Text selectable style={styles.code} numberOfLines={3}>
                        {open.pixCode}
                      </Text>
                      <Button label={copied ? "Código copiado" : "Copiar código PIX"} icon={copied ? <Check color={Colors.text} size={18} /> : <Copy color={Colors.text} size={18} />} onPress={copy} />
                    </>
                  ) : (
                    <Text style={styles.rejected}>O PIX ainda não está configurado pela LOCAKAR. Fale com o suporte para pagar esta parcela.</Text>
                  )}

                  <View style={styles.divider} />
                  <Text style={styles.cardTitle}>Já pagou?</Text>
                  <Text style={styles.muted}>Envie o comprovante. A parcela fica "Em análise" até a LOCAKAR confirmar.</Text>
                  <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                    <Button label="Tirar foto" variant="outline" size="sm" icon={<Camera color={Colors.text} size={16} />} onPress={() => pick("camera")} style={{ flex: 1 }} />
                    <Button label="Galeria" variant="outline" size="sm" icon={<ImageIcon color={Colors.text} size={16} />} onPress={() => pick("gallery")} style={{ flex: 1 }} />
                  </View>
                </>
              )}

              {open && step === "proof" && image && (
                <>
                  <Image source={{ uri: image }} style={styles.preview} accessibilityLabel="Prévia do comprovante" />
                  <Text style={[styles.muted, { textAlign: "center" }]}>Valor, data e recebedor precisam estar legíveis.</Text>
                  <Button label={sending ? "Enviando..." : `Enviar comprovante de ${money(open.total)}`} loading={sending} onPress={send} />
                  <Button label="Escolher outra imagem" variant="ghost" disabled={sending} onPress={() => setStep("pix")} />
                </>
              )}

              {step === "sent" && (
                <>
                  <Text style={styles.body}>A LOCAKAR vai conferir e você será avisado quando o pagamento for confirmado.</Text>
                  <Button label="Concluir" onPress={() => setOpen(null)} />
                </>
              )}

              {message && (
                <Text style={styles.rejected} accessibilityRole="alert">
                  {message}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 110 },
  title: { fontSize: 24, fontWeight: "700", color: Colors.text },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: Spacing.sm },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  muted: { color: Colors.textMuted, fontSize: 13 },
  body: { color: Colors.text, fontSize: 15, lineHeight: 22 },
  amount: { color: Colors.success, fontSize: 17, fontWeight: "800" },
  rejected: { color: Colors.danger, fontSize: 13, lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  sheet: { maxHeight: "92%", backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, borderTopWidth: 1, borderColor: Colors.border },
  sheetTitle: { color: Colors.text, fontSize: 18, fontWeight: "700" },
  label: { color: Colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  total: { color: Colors.success, fontSize: 30, fontWeight: "900" },
  qr: { alignSelf: "center", padding: 12, backgroundColor: "#FFFFFF", borderRadius: Radius.md },
  code: { color: Colors.textMuted, fontFamily: "monospace", fontSize: 11, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  divider: { height: 1, backgroundColor: Colors.border },
  preview: { width: "100%", height: 320, borderRadius: Radius.md, backgroundColor: Colors.card, resizeMode: "contain" },
});
