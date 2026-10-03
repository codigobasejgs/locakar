import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { PhotoPicker } from "../components/domain/PhotoPicker";
import { Screen } from "../components/domain/Screen";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { date } from "../constants/format";
import { DOCUMENT_KIND, REVIEW_STATUS } from "../constants/tenant";
import { Radius, Spacing, type ThemeColors } from "../constants/theme";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { useApi } from "../hooks/useApi";
import { useLocatario } from "../hooks/useLocatario";
import { api, type TenantDocument } from "../services/api";
import { newId, uploadImage } from "../services/upload";
import { useBrandName } from "../context/OrgProvider";

/** CNH e comprovante de endereço: envio para conferência da LOCAKAR, com status de cada um. */
export default function DocumentosScreen() {
  const brandName = useBrandName();
  const styles = useThemedStyles(makeStyles);
  const { summary } = useLocatario();
  const { data, error, reload } = useApi<{ documents: TenantDocument[] }>("/api/tenant/documents");
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: string; text: string } | null>(null);

  const send = async (kind: string) => {
    const uri = picked[kind];
    if (!uri || !summary) return;
    setSending(kind);
    setMessage(null);
    try {
      const path = await uploadImage("documentos", `${summary.client.id}/${kind}_${newId()}.jpg`, uri);
      await api("/api/tenant/documents", { method: "POST", body: { kind, path } });
      setPicked((p) => ({ ...p, [kind]: null }));
      await reload();
    } catch (e) {
      setMessage({ kind, text: (e as Error).message });
    }
    setSending(null);
  };

  return (
    <Screen error={error} onRefresh={reload}>
      <Text style={styles.intro}>Os documentos ficam guardados de forma privada e só a equipe da {brandName} tem acesso.</Text>
      {Object.entries(DOCUMENT_KIND).map(([kind, info]) => {
        const doc = data?.documents.find((d) => d.kind === kind);
        const pending = doc?.status === "pending_review";
        return (
          <Card key={kind} style={{ gap: Spacing.sm }}>
            <View style={styles.row}>
              <Text style={[styles.title, { flex: 1 }]}>{info.label}</Text>
              {doc && <Badge label={REVIEW_STATUS[doc.status]?.label ?? doc.status} tone={REVIEW_STATUS[doc.status]?.tone} />}
            </View>
            {doc && (
              <Text style={styles.muted}>
                Enviado em {date(doc.createdAt)}
                {doc.status === "rejected" && doc.rejectionReason ? ` · motivo: ${doc.rejectionReason}` : ""}
              </Text>
            )}
            {doc?.url && !picked[kind] && <Image source={{ uri: doc.url }} style={styles.preview} resizeMode="contain" accessibilityLabel={info.label} />}
            {!pending && (
              <>
                <PhotoPicker label={doc ? "Enviar nova foto" : "Foto do documento"} hint={info.hint} uri={picked[kind] ?? null} onError={(text) => setMessage({ kind, text })} onChange={(u) => setPicked((p) => ({ ...p, [kind]: u }))} />
                {picked[kind] && <Button label="Enviar para conferência" loading={sending === kind} onPress={() => send(kind)} />}
              </>
            )}
            {message?.kind === kind && (
              <Text style={styles.error} accessibilityRole="alert">
                {message.text}
              </Text>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
  intro: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  muted: { color: Colors.textMuted, fontSize: 13 },
  preview: { width: "100%", aspectRatio: 16 / 10, borderRadius: Radius.md, backgroundColor: Colors.surface },
  error: { color: Colors.danger, fontSize: 14 },
});
