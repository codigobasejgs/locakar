import { useRouter } from "expo-router";
import { ClipboardCheck, Wrench } from "lucide-react-native";
import { Image, StyleSheet, Text, View } from "react-native";
import { Empty, Screen, SectionTitle } from "../components/domain/Screen";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { date } from "../constants/format";
import { INSPECTION_KIND, INSPECTION_STATUS, MAINTENANCE_STATUS, fuelLabel } from "../constants/tenant";
import { Radius, Spacing, type ThemeColors } from "../constants/theme";
import { useTheme } from "../context/ThemeProvider";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { useApi } from "../hooks/useApi";
import { useLocatario } from "../hooks/useLocatario";
import { API_URL, type AppInspection, type Maintenance } from "../services/api";

/** Meu veículo: dados do carro, quilometragem, manutenções (sem custos) e vistorias feitas pelo app. */
export default function VeiculoScreen() {
  const { colors: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { activeRental: r, refreshing, refresh } = useLocatario();
  const vehicle = useApi<{ maintenance: Maintenance[] }>("/api/tenant/vehicle");
  const inspections = useApi<{ inspections: AppInspection[] }>("/api/tenant/inspections");
  const v = r?.vehicle;
  const mine = (inspections.data?.inspections ?? []).filter((i) => i.rentalId === r?.id);
  const current = r && ["active", "late", "pending"].includes(r.status);

  if (!r || !v) return <Screen><Empty icon={<ClipboardCheck color={Colors.textMuted} size={40} />} title="Nenhum veículo" text="Quando a LOCAKAR registrar sua locação, o carro aparece aqui." /></Screen>;

  const image = v.image ? (v.image.startsWith("http") ? v.image : `${API_URL}${v.image}`) : null;
  const specs: [string, string][] = [
    ["Placa", v.plate],
    ["Ano", v.yearModel ? `${v.year}/${v.yearModel}` : String(v.year)],
    ["Câmbio", v.transmission],
    ["Combustível", v.fuel],
    ["Lugares", v.seats ? String(v.seats) : "—"],
    ["Km na retirada", r.kmStart != null ? `${r.kmStart.toLocaleString("pt-BR")} km` : "—"],
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} error={vehicle.error}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {image && <Image source={{ uri: image }} style={styles.image} resizeMode="contain" accessibilityLabel={v.name} />}
        <View style={{ padding: Spacing.md, gap: Spacing.md }}>
          <View>
            <Text style={styles.name}>{v.name}</Text>
            <Text style={styles.muted}>{[v.brand, v.category].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={styles.grid}>
            {specs.map(([label, value]) => (
              <View key={label} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      </Card>

      {current && (
        <Card accent style={{ gap: Spacing.sm }}>
          <Text style={styles.cardTitle}>Vistoria pelo app</Text>
          <Text style={styles.muted}>
            Registre o estado do carro com fotos na retirada, na devolução ou quando a LOCAKAR pedir. Fica guardado como prova para você e para a locadora.
          </Text>
          <View style={{ flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" }}>
            {!mine.some((i) => i.kind === "delivery") && <Button label="Retirada" size="sm" onPress={() => router.push({ pathname: "/vistoria", params: { kind: "delivery" } })} style={{ flexGrow: 1 }} />}
            <Button label="Devolução" size="sm" variant="outline" onPress={() => router.push({ pathname: "/vistoria", params: { kind: "return" } })} style={{ flexGrow: 1 }} />
            <Button label="Periódica" size="sm" variant="outline" onPress={() => router.push({ pathname: "/vistoria", params: { kind: "periodic" } })} style={{ flexGrow: 1 }} />
          </View>
        </Card>
      )}

      {mine.length > 0 && <SectionTitle>Minhas vistorias</SectionTitle>}
      {mine.map((i) => (
        <Card key={i.id} style={{ gap: Spacing.sm }}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { flex: 1 }]}>{INSPECTION_KIND[i.kind]} · {date(i.createdAt)}</Text>
            <Badge label={INSPECTION_STATUS[i.status]?.label ?? i.status} tone={INSPECTION_STATUS[i.status]?.tone} />
          </View>
          <Text style={styles.muted}>
            {i.km.toLocaleString("pt-BR")} km · combustível {fuelLabel(i.fuel)} · {i.items.filter((x) => !x.ok).length} item(ns) com problema
          </Text>
          {i.adminNotes && <Text style={styles.note}>LOCAKAR: {i.adminNotes}</Text>}
          <View style={styles.thumbs}>
            {i.photos.slice(0, 6).map((p, n) => (p.url ? <Image key={n} source={{ uri: p.url }} style={styles.thumb} accessibilityLabel={`Foto ${n + 1}`} /> : null))}
          </View>
        </Card>
      ))}

      <SectionTitle>Manutenções</SectionTitle>
      {!vehicle.data?.maintenance.length ? (
        <Empty icon={<Wrench color={Colors.textMuted} size={32} />} title="Nenhuma manutenção registrada" text="Revisões e trocas programadas do seu carro aparecem aqui." />
      ) : (
        vehicle.data.maintenance.map((m) => (
          <Card key={m.id} style={{ gap: 4 }}>
            <View style={styles.row}>
              <Text style={[styles.cardTitle, { flex: 1 }]}>{m.description}</Text>
              <Badge label={MAINTENANCE_STATUS[m.status]?.label ?? m.status} tone={MAINTENANCE_STATUS[m.status]?.tone} />
            </View>
            <Text style={styles.muted}>
              {date(m.date)}
              {m.nextKm ? ` · próxima aos ${m.nextKm.toLocaleString("pt-BR")} km` : ""}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
  image: { width: "100%", aspectRatio: 16 / 9, backgroundColor: Colors.surfaceElevated },
  name: { color: Colors.text, fontSize: 20, fontWeight: "700" },
  muted: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: Spacing.md },
  field: { width: "50%", paddingRight: Spacing.sm },
  label: { fontSize: 11, color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 15, fontWeight: "600", color: Colors.text, marginTop: 2 },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  note: { color: Colors.brandSoft, fontSize: 13 },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  thumb: { width: 56, height: 56, borderRadius: Radius.sm, backgroundColor: Colors.surface },
});
