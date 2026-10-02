import * as Clipboard from "expo-clipboard";
import { Check, Copy, ExternalLink, Landmark } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Linking, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { Radius, Spacing, Type, type ThemeColors } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import { api, type Installment } from "../../services/api";

const LABEL: Record<string, string> = { PIX: "Pix", BOLETO: "Boleto", CREDIT_CARD: "Cartão de crédito", UNDEFINED: "Escolher na fatura" };

interface Charge {
  id: string;
  status: string;
  billingType: string | null;
  invoiceUrl: string | null;
  amountCents: number;
}

/**
 * "Pagar agora" via Asaas. O app só fala com o backend LOCAKAR (que guarda a API Key); cartão é pago na fatura
 * hospedada do Asaas, sem dados de cartão no app. A baixa vem do webhook; ao voltar ao app consultamos o status.
 */
export function AsaasPay({ installment, rentalId, methods, onPaid }: { installment: Installment; rentalId: string; methods: string[]; onPaid: () => void }) {
  const { colors: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [charge, setCharge] = useState<Charge | null>(installment.asaas ? { id: installment.asaas.id, status: "link_created", billingType: installment.asaas.billingType, invoiceUrl: installment.asaas.invoiceUrl, amountCents: Math.round(installment.total * 100) } : null);
  const [pix, setPix] = useState<{ image: string | null; payload: string | null } | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const ref = useRef(charge);
  ref.current = charge;

  useEffect(() => {
    if (!charge || charge.status !== "link_created") return;
    if (charge.billingType === "PIX") api<{ image: string | null; payload: string | null }>("/api/tenant/asaas", { method: "POST", body: { action: "pix", id: charge.id } }).then(setPix).catch(() => {});
    if (charge.billingType === "BOLETO") api<{ identificationField: string | null }>("/api/tenant/asaas", { method: "POST", body: { action: "boleto", id: charge.id } }).then((r) => setLine(r.identificationField)).catch(() => {});
  }, [charge]);

  const check = async (silent: boolean) => {
    const c = ref.current;
    if (!c) return;
    if (!silent) setBusy("check");
    try {
      const r = await api<{ charge: Charge }>("/api/tenant/asaas", { method: "POST", body: { action: "status", id: c.id } });
      setCharge(r.charge);
      if (r.charge.status === "paid" || r.charge.status === "chargeback") onPaid();
      else if (!silent) setMessage("Ainda não recebemos a confirmação do pagamento. Se você já pagou, aguarde alguns instantes.");
    } catch (e) {
      if (!silent) setMessage((e as Error).message);
    }
    if (!silent) setBusy(null);
  };

  // Voltou da fatura/banco: confere o status sem o cliente precisar tocar em nada.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && ref.current && check(true));
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = async (billingType: string) => {
    setBusy(billingType);
    setMessage(null);
    try {
      const r = await api<{ charge: Charge }>("/api/tenant/asaas", { method: "POST", body: { action: "pay", rentalId, installmentId: installment.id, billingType } });
      setCharge(r.charge);
      if ((r.charge.billingType === "CREDIT_CARD" || r.charge.billingType === "UNDEFINED") && r.charge.invoiceUrl) await Linking.openURL(r.charge.invoiceUrl);
    } catch (e) {
      setMessage((e as Error).message);
    }
    setBusy(null);
  };
  const copy = async (text: string, key: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(key);
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Pagar online</Text>
      {!charge ? (
        <>
          <Text style={styles.muted}>Escolha a forma de pagamento. A confirmação é automática, sem enviar comprovante.</Text>
          {methods.map((m) => (
            <Button key={m} label={busy === m ? "Gerando..." : LABEL[m] ?? m} loading={busy === m} disabled={!!busy} variant={m === methods[0] ? "primary" : "outline"} size="sm" onPress={() => pay(m)} />
          ))}
        </>
      ) : (
        <>
          {charge.billingType === "PIX" && (
            <>
              {pix?.image ? <Image source={{ uri: pix.image }} style={styles.qr} accessibilityLabel="QR Code Pix" /> : <Text style={styles.muted}>Carregando QR Code...</Text>}
              {pix?.payload && (
                <>
                  <Text selectable style={styles.code} numberOfLines={3}>{pix.payload}</Text>
                  <Button label={copied === "pix" ? "Código copiado" : "Copiar código Pix"} size="sm" icon={copied === "pix" ? <Check color={Colors.text} size={16} /> : <Copy color={Colors.text} size={16} />} onPress={() => copy(pix.payload!, "pix")} />
                </>
              )}
            </>
          )}
          {charge.billingType === "BOLETO" && (
            <>
              {line ? <Text selectable style={styles.code}>{line}</Text> : <Text style={styles.muted}>Carregando linha digitável...</Text>}
              {line && <Button label={copied === "line" ? "Linha copiada" : "Copiar linha digitável"} size="sm" icon={<Copy color={Colors.text} size={16} />} onPress={() => copy(line, "line")} />}
            </>
          )}
          {charge.invoiceUrl && <Button label={charge.billingType === "CREDIT_CARD" || charge.billingType === "UNDEFINED" ? "Pagar agora" : "Abrir fatura"} variant={charge.billingType === "PIX" || charge.billingType === "BOLETO" ? "outline" : "primary"} size="sm" icon={<ExternalLink color={Colors.text} size={16} />} onPress={() => Linking.openURL(charge.invoiceUrl!)} />}
          <Button label={busy === "check" ? "Verificando..." : "Já paguei — verificar"} variant="ghost" size="sm" disabled={!!busy} icon={<Landmark color={Colors.text} size={16} />} onPress={() => check(false)} />
        </>
      )}
      {message && <Text style={styles.error} accessibilityRole="alert">{message}</Text>}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    box: { gap: Spacing.s12, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.brandBorder, backgroundColor: Colors.brandTint },
    title: { ...Type.heading, color: Colors.text },
    muted: { ...Type.small, color: Colors.textMuted },
    qr: { width: 200, height: 200, alignSelf: "center", backgroundColor: "#FFFFFF", borderRadius: Radius.md },
    code: { color: Colors.textMuted, fontFamily: "monospace", fontSize: 11, backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },
    error: { color: Colors.danger, fontSize: 13, lineHeight: 18 },
  });
