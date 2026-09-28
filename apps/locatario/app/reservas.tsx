import { CalendarDays } from "lucide-react-native";
import { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Empty, Screen, SectionTitle } from "../components/domain/Screen";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { date, money } from "../constants/format";
import { RESERVATION_STATUS } from "../constants/tenant";
import { Colors, Radius, Spacing } from "../constants/theme";
import { useApi } from "../hooks/useApi";
import { API_URL, api, type FleetVehicle, type Reservation } from "../services/api";

/** "DD/MM/AAAA" → "AAAA-MM-DD" (inválida → null). */
function toIso(v: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[1]) ? null : iso;
}
const maskDate = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");

/** Pedir uma nova reserva (a LOCAKAR confirma) e acompanhar/cancelar as suas. */
export default function ReservasScreen() {
  const { data, error, reload } = useApi<{ reservations: Reservation[]; fleet: FleetVehicle[] }>("/api/tenant/reservations");
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const request = async () => {
    setMessage(null);
    const startDate = toIso(start);
    const endDate = toIso(end);
    if (!vehicleId) return setMessage({ tone: "error", text: "Escolha o carro." });
    if (!startDate || !endDate) return setMessage({ tone: "error", text: "Informe as datas no formato DD/MM/AAAA." });
    setBusy("create");
    try {
      await api("/api/tenant/reservations", { method: "POST", body: { action: "create", vehicleId, startDate, endDate } });
      setMessage({ tone: "ok", text: "Pedido enviado! A LOCAKAR vai confirmar e você recebe um aviso." });
      setVehicleId(null);
      setStart("");
      setEnd("");
      await reload();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    }
    setBusy(null);
  };

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await api("/api/tenant/reservations", { method: "POST", body: { action: "cancel", id } });
      setConfirmCancel(null);
      await reload();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    }
    setBusy(null);
  };

  const reservations = data?.reservations ?? [];

  return (
    <Screen error={error} onRefresh={reload}>
      <SectionTitle>Pedir reserva</SectionTitle>
      <View style={{ gap: Spacing.sm }}>
        {(data?.fleet ?? []).map((v) => {
          const on = vehicleId === v.id;
          return (
            <TouchableOpacity key={v.id} onPress={() => setVehicleId(v.id)} style={[styles.car, on && styles.carOn]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={v.name}>
              <Image source={{ uri: v.image.startsWith("http") ? v.image : `${API_URL}${v.image}` }} style={styles.carImage} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{v.name}</Text>
                <Text style={styles.muted}>
                  {v.category} · {v.transmission} · {v.seats} lugares
                </Text>
                {(v.weeklyRate || v.dailyRate) && <Text style={styles.price}>{v.weeklyRate ? `${money(v.weeklyRate)}/semana` : `${money(v.dailyRate)}/dia`}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: Spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Input label="Retirada" placeholder="DD/MM/AAAA" keyboardType="number-pad" value={start} onChangeText={(t) => setStart(maskDate(t))} />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Devolução" placeholder="DD/MM/AAAA" keyboardType="number-pad" value={end} onChangeText={(t) => setEnd(maskDate(t))} />
        </View>
      </View>
      {message && (
        <Text style={{ color: message.tone === "ok" ? Colors.success : Colors.danger, fontSize: 14 }} accessibilityRole="alert">
          {message.text}
        </Text>
      )}
      <Button label="Enviar pedido" loading={busy === "create"} onPress={request} />
      <Text style={styles.muted}>O pedido não garante a reserva: a LOCAKAR confirma a disponibilidade e as condições.</Text>

      <SectionTitle>Minhas reservas</SectionTitle>
      {!reservations.length ? (
        <Empty icon={<CalendarDays color={Colors.textMuted} size={32} />} title="Nenhuma reserva" />
      ) : (
        reservations.map((r) => (
          <Card key={r.id} style={{ gap: Spacing.sm }}>
            <View style={styles.row}>
              <Text style={[styles.title, { flex: 1 }]}>{r.vehicleName}</Text>
              <Badge label={RESERVATION_STATUS[r.status]?.label ?? r.status} tone={RESERVATION_STATUS[r.status]?.tone} />
            </View>
            <Text style={styles.muted}>
              {date(r.startDate)} a {date(r.endDate)}
            </Text>
            {["pending", "confirmed"].includes(r.status) &&
              (confirmCancel === r.id ? (
                <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                  <Button label="Manter" variant="ghost" size="sm" onPress={() => setConfirmCancel(null)} style={{ flex: 1 }} />
                  <Button label="Cancelar reserva" variant="danger" size="sm" loading={busy === r.id} onPress={() => cancel(r.id)} style={{ flex: 1 }} />
                </View>
              ) : (
                <Button label="Cancelar" variant="ghost" size="sm" onPress={() => setConfirmCancel(r.id)} />
              ))}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  title: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  muted: { color: Colors.textMuted, fontSize: 12, lineHeight: 17 },
  price: { color: Colors.brandSoft, fontSize: 13, fontWeight: "700", marginTop: 2 },
  car: { flexDirection: "row", gap: Spacing.md, alignItems: "center", padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  carOn: { borderColor: Colors.magenta, backgroundColor: "#130A17" },
  carImage: { width: 96, height: 60, borderRadius: Radius.sm, backgroundColor: "#F4F4F5" },
});
