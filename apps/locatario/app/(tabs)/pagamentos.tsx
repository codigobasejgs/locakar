import * as Clipboard from "expo-clipboard";
import { Camera, Check, Copy, CreditCard, Image as ImageIcon, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Empty } from "../../components/domain/Screen";
import { TenantPage } from "../../components/layout/TenantPage";
import { InstallmentBadge } from "../../components/domain/InstallmentStatus";
import { ErrorBanner } from "../../components/domain/ScreenState";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { date, money } from "../../constants/format";
import { Colors, Radius, Spacing, Type } from "../../constants/theme";
import { useLayout } from "../../hooks/useLayout";
import { useLocatario } from "../../hooks/useLocatario";
import { api, type Installment } from "../../services/api";
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
  // Checkout InfinitePay aberto: id da tentativa. Ao voltar ao app, consulta o status e baixa sozinho.
  const [card, setCard] = useState<{ id: string; installmentId: string } | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardPaid, setCardPaid] = useState(false);
  const cardRef = useRef(card);
  cardRef.current = card;
  const cardEnabled = Boolean(summary?.infinitepay?.checkout);

  const installments = activeRental?.installments ?? [];
  const insets = useSafeAreaInsets();
  const { isDesktop, isTablet } = useLayout();
  const wide = isDesktop || isTablet;
  const openCount = installments.filter((i) => !i.paid).length;

  const openInstallment = (i: Installment) => {
    setOpen(i);
    setCardPaid(false);
    setStep("pix");
    setImage(null);
    setMessage(null);
    setCopied(false);
  };
  const close = () => !sending && !cardBusy && setOpen(null);

  const checkCard = async (silent = false) => {
    const current = cardRef.current;
    if (!current) return;
    if (!silent) setCardBusy(true);
    try {
      const r = await api<{ status: string }>("/api/tenant/infinitepay", { method: "POST", body: { action: "check", id: current.id } });
      if (r.status === "paid") {
        setCardPaid(true);
        setCard(null);
        refresh();
      } else if (!silent) {
        setMessage(r.status === "amount_mismatch" ? "O valor pago é diferente do cobrado. Fale com a LOCAKAR." : "Ainda não recebemos a confirmação da InfinitePay. Se você já pagou, aguarde alguns segundos e toque de novo.");
      }
    } catch (e) {
      if (!silent) setMessage((e as Error).message);
    }
    if (!silent) setCardBusy(false);
  };

  // Voltou do checkout (app em primeiro plano): confere o pagamento automaticamente.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && cardRef.current) checkCard(true);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payWithCard = async () => {
    if (!open || !activeRental) return;
    setMessage(null);
    setCardBusy(true);
    try {
      const r = await api<{ id: string; url: string }>("/api/tenant/infinitepay", { method: "POST", body: { action: "checkout", rentalId: activeRental.id, installmentId: open.id } });
      setCard({ id: r.id, installmentId: open.id });
      await Linking.openURL(r.url);
    } catch (e) {
      setMessage((e as Error).message);
    }
    setCardBusy(false);
  };

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
    <>
    <TenantPage title="Pagamentos" subtitle={installments.length ? `${openCount} em aberto · ${installments.length - openCount} pago(s)` : undefined} refreshing={refreshing} onRefresh={refresh}>
        {error && <ErrorBanner message={error} onRetry={refresh} />}

        {installments.length === 0 ? (
          <Card>
            <Empty icon={<CreditCard color={Colors.textMuted} size={24} />} title="Nenhuma parcela" text="As parcelas da sua locação aparecem aqui." />
          </Card>
        ) : (
          <View style={styles.list}>
          {installments.map((i) => (
            <Card key={i.id} style={[{ gap: Spacing.s12, width: "100%" }, wide && styles.itemWide]}>
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
                <Button label={i.proofStatus === "rejected" ? "Pagar ou reenviar comprovante" : cardEnabled ? "Pagar" : "Pagar com PIX"} size="sm" onPress={() => openInstallment(i)} />
              )}
            </Card>
          ))}
          </View>
        )}
    </TenantPage>

      <Modal visible={!!open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }, wide && styles.sheetWide]}>
            <View style={styles.rowBetween}>
              <Text style={styles.sheetTitle}>{cardPaid ? "Pagamento confirmado" : step === "sent" ? "Comprovante enviado" : step === "proof" ? "Confira o comprovante" : cardEnabled ? "Pagar parcela" : "Pagar com PIX"}</Text>
              <TouchableOpacity onPress={close} disabled={sending} accessibilityRole="button" accessibilityLabel="Fechar">
                <X color={Colors.textMuted} size={24} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: Spacing.md, paddingTop: Spacing.md }}>
              {cardPaid && (
                <>
                  <View style={styles.paidBox}>
                    <Check color={Colors.success} size={28} />
                    <Text style={styles.body}>Pagamento confirmado pela InfinitePay. A parcela já consta como paga e o recibo foi enviado para o seu e-mail.</Text>
                  </View>
                  <Button label="Concluir" onPress={() => setOpen(null)} />
                </>
              )}

              {open && !cardPaid && step === "pix" && (
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

                  {cardEnabled && (
                    <View style={styles.cardBox}>
                      <Text style={styles.cardTitle}>Cartão de crédito ou débito</Text>
                      <Text style={styles.muted}>Pague com cartão em até 12x ou Pix pela InfinitePay. A confirmação é automática, sem enviar comprovante.</Text>
                      <Button label={cardBusy ? "Abrindo pagamento..." : "Pagar com cartão (InfinitePay)"} loading={cardBusy && !card} icon={<CreditCard color={Colors.text} size={18} />} onPress={payWithCard} />
                      {card?.installmentId === open.id && (
                        <Button label={cardBusy ? "Verificando..." : "Já paguei — verificar pagamento"} variant="outline" size="sm" disabled={cardBusy} onPress={() => checkCard(false)} />
                      )}
                    </View>
                  )}

                  {cardEnabled && <Text style={styles.or}>ou pague com PIX</Text>}

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
    </>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.s12 },
  itemWide: { width: undefined, flexBasis: "48%", flexGrow: 1 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: Spacing.sm, flexWrap: "wrap" },
  cardTitle: { ...Type.heading, color: Colors.text },
  muted: { ...Type.small, color: Colors.textMuted, flexShrink: 1 },
  body: { ...Type.body, color: Colors.text },
  amount: { ...Type.money, fontSize: 18, color: Colors.text },
  rejected: { color: Colors.danger, fontSize: 13, lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: "flex-end", alignItems: "center" },
  sheetWide: { maxWidth: 520, borderRadius: Radius.xl, marginVertical: "auto", borderWidth: 1 },
  sheet: { width: "100%", maxHeight: "92%", backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.lg, borderTopWidth: 1, borderColor: Colors.border },
  sheetTitle: { color: Colors.text, fontSize: 18, fontWeight: "700" },
  label: { color: Colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  total: { ...Type.money, fontSize: 32, lineHeight: 38, color: Colors.text },
  qr: { alignSelf: "center", padding: 12, backgroundColor: "#FFFFFF", borderRadius: Radius.md },
  code: { color: Colors.textMuted, fontFamily: "monospace", fontSize: 11, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
  cardBox: { gap: Spacing.s12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.brandBorder, backgroundColor: Colors.brandTint },
  or: { ...Type.label, color: Colors.textSubtle, textAlign: "center" },
  paidBox: { alignItems: "center", gap: Spacing.s12, padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1, borderColor: "rgba(52, 211, 153, 0.3)", backgroundColor: Colors.successSoft },
  divider: { height: 1, backgroundColor: Colors.border },
  preview: { width: "100%", height: 320, borderRadius: Radius.md, backgroundColor: Colors.card, resizeMode: "contain" },
});
