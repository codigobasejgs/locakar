import { AlertTriangle, MessageCircle, Plus } from "lucide-react-native";
import { useState } from "react";
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PhotoPicker } from "../components/domain/PhotoPicker";
import { Empty, Screen, SectionTitle } from "../components/domain/Screen";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { whatsappUrl } from "../constants/company";
import { date } from "../constants/format";
import { INCIDENT_CATEGORY, INCIDENT_STATUS } from "../constants/tenant";
import { Radius, Spacing, type ThemeColors } from "../constants/theme";
import { useTheme } from "../context/ThemeProvider";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { useApi } from "../hooks/useApi";
import { useLocatario } from "../hooks/useLocatario";
import { api, type Incident } from "../services/api";
import { newId, uploadImage } from "../services/upload";
import { useBrandName } from "../context/OrgProvider";

/** Reportar problema no veículo (com fotos) e acompanhar a resposta da LOCAKAR. */
export default function OcorrenciasScreen() {
  const brandName = useBrandName();
  const { colors: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { activeRental: r, summary } = useLocatario();
  const { data, error, reload } = useApi<{ incidents: Incident[] }>("/api/tenant/incidents");
  const [form, setForm] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [requestId, setRequestId] = useState(newId);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const send = async () => {
    setMessage(null);
    if (!r || !summary) return;
    if (!category) return setMessage("Escolha o tipo do problema.");
    if (description.trim().length < 10) return setMessage("Descreva o problema com pelo menos 10 caracteres.");
    setSending(true);
    try {
      const paths = [];
      for (const [n, uri] of photos.entries()) paths.push(await uploadImage("ocorrencias", `${summary.client.id}/${requestId}_${n}.jpg`, uri));
      await api("/api/tenant/incidents", { method: "POST", body: { requestId, rentalId: r.id, category, description, photos: paths } });
      setForm(false);
      setCategory(null);
      setDescription("");
      setPhotos([]);
      setRequestId(newId());
      await reload();
    } catch (e) {
      setMessage((e as Error).message);
    }
    setSending(false);
  };

  return (
    <Screen
      error={error}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await reload();
        setRefreshing(false);
      }}
    >
      <Card style={styles.urgent}>
        <AlertTriangle color={Colors.warning} size={20} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.body}>Acidente ou carro parado na via? Ligue 190/193 se houver feridos e fale com a {brandName} agora.</Text>
          <Button
            label={`WhatsApp da ${brandName}`}
            size="sm"
            variant="outline"
            icon={<MessageCircle color={Colors.text} size={16} />}
            onPress={() => Linking.openURL(whatsappUrl(summary?.support.whatsapp, `Olá, ${brandName}! Urgente: problema com o veículo ${r?.vehicle?.plate ?? ""}.`))}
          />
        </View>
      </Card>

      {!r ? (
        <Empty icon={<AlertTriangle color={Colors.textMuted} size={36} />} title="Nenhuma locação" />
      ) : form ? (
        <Card style={{ gap: Spacing.md }}>
          <Text style={styles.cardTitle}>Novo relato · {r.vehicle?.plate}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {Object.entries(INCIDENT_CATEGORY).map(([key, label]) => (
              <TouchableOpacity key={key} onPress={() => setCategory(key)} style={[styles.chip, category === key && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: category === key }}>
                <Text style={[styles.chipText, category === key && { color: Colors.text }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input label="O que aconteceu?" placeholder="Ex.: pneu dianteiro direito furou na Av. X, estou no posto Y." multiline maxLength={2000} value={description} onChangeText={setDescription} style={{ minHeight: 96, textAlignVertical: "top" }} />
          {photos.map((uri, n) => (
            <PhotoPicker key={uri} label={`Foto ${n + 1}`} uri={uri} onError={setMessage} onChange={(u) => setPhotos(u ? photos.map((x, i) => (i === n ? u : x)) : photos.filter((_, i) => i !== n))} />
          ))}
          {photos.length < 6 && <PhotoPicker label="Adicionar foto" hint={`Opcional, ajuda a ${brandName} a entender o problema.`} uri={null} onError={setMessage} onChange={(u) => u && setPhotos([...photos, u])} />}
          {message && (
            <Text style={styles.error} accessibilityRole="alert">
              {message}
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <Button label="Cancelar" variant="ghost" onPress={() => setForm(false)} style={{ flex: 1 }} />
            <Button label="Enviar relato" loading={sending} onPress={send} style={{ flex: 2 }} />
          </View>
        </Card>
      ) : (
        <Button label="Relatar um problema" icon={<Plus color={Colors.text} size={18} />} onPress={() => setForm(true)} />
      )}

      <SectionTitle>Meus relatos</SectionTitle>
      {!data?.incidents.length ? (
        <Empty icon={<AlertTriangle color={Colors.textMuted} size={32} />} title="Nenhum relato" text={`Os problemas que você relatar aparecem aqui com a resposta da ${brandName}.`} />
      ) : (
        data.incidents.map((i) => (
          <Card key={i.id} style={{ gap: Spacing.sm }}>
            <View style={styles.row}>
              <Text style={[styles.cardTitle, { flex: 1 }]}>{INCIDENT_CATEGORY[i.category] ?? i.category}</Text>
              <Badge label={INCIDENT_STATUS[i.status]?.label ?? i.status} tone={INCIDENT_STATUS[i.status]?.tone} />
            </View>
            <Text style={styles.muted}>{date(i.createdAt)}</Text>
            <Text style={styles.body}>{i.description}</Text>
            {i.adminNotes && <Text style={styles.reply}>{brandName}: {i.adminNotes}</Text>}
            {i.photos.length > 0 && (
              <View style={styles.thumbs}>
                {i.photos.map((src, n) => (
                  <Image key={n} source={{ uri: src }} style={styles.thumb} accessibilityLabel={`Foto ${n + 1}`} />
                ))}
              </View>
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
  urgent: { flexDirection: "row", gap: Spacing.sm, borderColor: Colors.warning, backgroundColor: Colors.warningSoft },
  body: { color: Colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: Colors.textMuted, fontSize: 12 },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.borderStrong },
  chipOn: { borderColor: Colors.brandSoft, backgroundColor: Colors.brandTint },
  chipText: { color: Colors.textMuted, fontSize: 13, fontWeight: "600" },
  error: { color: Colors.danger, fontSize: 14 },
  reply: { color: Colors.brandSoft, fontSize: 14, lineHeight: 20 },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  thumb: { width: 64, height: 64, borderRadius: Radius.sm, backgroundColor: Colors.surface },
});
