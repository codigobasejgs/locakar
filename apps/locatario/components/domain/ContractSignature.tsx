import { Download, FileSignature, ShieldCheck } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Spacing, Type, type ThemeColors } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import { api, type TenantRental } from "../../services/api";

type SignatureStatus = NonNullable<NonNullable<TenantRental["contract"]>["signature"]>["status"];
const STATUS: Record<SignatureStatus, { label: string; tone: BadgeTone }> = {
  sending: { label: "Preparando", tone: "info" },
  awaiting_signature: { label: "Aguardando sua assinatura", tone: "warning" },
  partially_signed: { label: "Aguardando a locadora", tone: "info" },
  completed: { label: "Assinado", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
  expired: { label: "Expirado", tone: "neutral" },
  cancelled: { label: "Cancelado", tone: "neutral" },
  error: { label: "Em revisão pela locadora", tone: "neutral" },
};
type SyncState = { state: { process: { status: SignatureStatus }; signers: { role: string; status: string }[] } | null };

/**
 * Assinatura pela Autentique. O app só abre o link oficial; quem confirma é o servidor
 * consultando a Autentique (voltar ao app nunca conta como assinatura).
 */
export function ContractSignature({ contract, onChanged }: { contract: NonNullable<TenantRental["contract"]>; onChanged: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const signature = contract.signature;
  const [status, setStatus] = useState<SignatureStatus | null>(signature?.status ?? null);
  const [clientSigned, setClientSigned] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"link" | "sync" | "download" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const opened = useRef(false);

  const sync = async (silent = false) => {
    if (!signature) return;
    if (!silent) setBusy("sync");
    setMessage("Estamos verificando sua assinatura…");
    try {
      const r = await api<SyncState>("/api/tenant/contracts", { method: "POST", body: { action: "sync", processId: signature.processId } });
      const next = r.state?.process.status ?? status;
      const mine = r.state?.signers.find((s) => s.role === "client")?.status === "signed";
      setStatus(next);
      setClientSigned(mine);
      setMessage(next === "completed" ? "Contrato assinado por todos." : mine ? "Sua assinatura foi confirmada. Aguardando a locadora." : "Ainda não recebemos a confirmação da Autentique. Se você já assinou, aguarde alguns segundos e toque em Verificar.");
      if (next !== signature.status) onChanged();
    } catch (e) {
      setMessage((e as Error).message);
    }
    if (!silent) setBusy(null);
  };

  // Voltou do navegador: consulta o servidor, nunca presume assinatura.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && opened.current) {
        opened.current = false;
        void sync(true);
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature?.processId]);

  const openSigning = async () => {
    if (!signature) return;
    setBusy("link");
    setMessage(null);
    try {
      const { url } = await api<{ url: string }>("/api/tenant/contracts", { method: "POST", body: { action: "link", processId: signature.processId } });
      opened.current = true;
      setConfirming(false);
      await Linking.openURL(url);
    } catch (e) {
      setMessage((e as Error).message);
    }
    setBusy(null);
  };

  const download = async () => {
    if (!signature) return;
    setBusy("download");
    try {
      const { url } = await api<{ url: string }>("/api/tenant/contracts", { method: "POST", body: { action: "download", processId: signature.processId } });
      await Linking.openURL(url);
    } catch (e) {
      setMessage((e as Error).message);
    }
    setBusy(null);
  };

  if (!signature || !status) {
    return <Text style={styles.muted}>{contract.status === "signed" ? "Contrato assinado." : "A locadora vai enviar seu contrato para assinatura."}</Text>;
  }
  const canSign = status === "awaiting_signature" && !clientSigned;

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <ShieldCheck color={colors.brandSoft} size={18} />
        <Text style={styles.title}>Assinatura eletrônica</Text>
        <View style={{ flex: 1 }} />
        <Badge label={STATUS[status].label} tone={STATUS[status].tone} />
      </View>

      {canSign && !confirming && <Button label="Assinar contrato" icon={<FileSignature color="#FFFFFF" size={18} />} onPress={() => setConfirming(true)} />}
      {canSign && confirming && (
        <View style={styles.notice}>
          <Text style={styles.text}>Você será direcionado para o ambiente seguro de assinatura da Autentique. Leia o contrato antes de assinar.</Text>
          <Button label="Continuar para a Autentique" loading={busy === "link"} onPress={openSigning} />
          <Button label="Voltar" variant="ghost" disabled={busy === "link"} onPress={() => setConfirming(false)} />
        </View>
      )}
      {(status === "awaiting_signature" || status === "partially_signed") && <Button label="Verificar assinatura" variant="outline" loading={busy === "sync"} onPress={() => sync()} />}
      {status === "completed" && <Button label="Ver contrato assinado" variant="outline" icon={<Download color={colors.text} size={18} />} loading={busy === "download"} onPress={download} />}
      {(status === "rejected" || status === "expired" || status === "cancelled" || status === "error") && <Text style={styles.muted}>Fale com a locadora para receber um novo contrato.</Text>}
      {message && <Text style={styles.muted} accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    box: { gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border, paddingTop: Spacing.md },
    row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
    title: { color: Colors.text, fontSize: 14, fontWeight: "700" },
    notice: { gap: Spacing.sm },
    text: { ...Type.small, color: Colors.text },
    muted: { ...Type.small, color: Colors.textMuted },
  });
