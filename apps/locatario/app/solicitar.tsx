import { useRouter, useLocalSearchParams } from "expo-router";
import { Check, ShieldCheck, Car } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PhotoPicker } from "../components/domain/PhotoPicker";
import { Screen } from "../components/domain/Screen";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { date, money } from "../constants/format";
import { Colors, Radius, Spacing } from "../constants/theme";
import { useLocatario } from "../hooks/useLocatario";
import { API_URL, api, type FleetVehicle } from "../services/api";
import { readCache, removeCache, writeCache } from "../services/cache";
import { newId, uploadImage } from "../services/upload";

function toIso(v: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[1]) ? null : iso;
}
const maskDate = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");

interface Draft {
  vehicleId: string;
  startDate: string;
  endDate: string;
  planType: "weekly" | "daily";
  cnhNumber: string;
  cnhCategory: string;
  cnhExpiry: string;
  cnhFrontUri: string | null;
  cnhBackUri: string | null;
  addressProofUri: string | null;
  selfieUri: string | null;
  uploaded: Record<string, string>;
}

const DRAFT_KEY = "solicitar:draft";
const STEPS = ["Veículo e período", "Habilitação (CNH)", "Documentos", "Revisão e envio"];
const CATEGORIES = ["B", "AB", "A", "C", "D", "E"] as const;

export default function SolicitarLocacaoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string }>();
  const { summary, refresh } = useLocatario();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    vehicleId: params.vehicleId ?? "",
    startDate: "",
    endDate: "",
    planType: "weekly",
    cnhNumber: summary?.client.cnhNumber ?? "",
    cnhCategory: summary?.client.cnhCategory ?? "B",
    cnhExpiry: summary?.client.cnhExpiry ? maskDate(summary.client.cnhExpiry.split("-").reverse().join("")) : "",
    cnhFrontUri: null,
    cnhBackUri: null,
    addressProofUri: null,
    selfieUri: null,
    uploaded: {},
  });
  const [fleet, setFleet] = useState<FleetVehicle[]>(summary?.fleet ?? []);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    readCache<Draft>(DRAFT_KEY).then((saved) => {
      if (saved) {
        setDraft((d) => ({ ...d, ...saved, vehicleId: params.vehicleId || saved.vehicleId || d.vehicleId }));
      }
    });
    // Se a frota não veio no summary, carrega de reservations
    if (!fleet.length) {
      api<{ fleet: FleetVehicle[] }>("/api/tenant/reservations").then((r) => r.fleet && setFleet(r.fleet)).catch(() => {});
    }
  }, [params.vehicleId, fleet.length]);

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      writeCache(DRAFT_KEY, next);
      return next;
    });

  const selectedVehicle = fleet.find((v) => v.id === draft.vehicleId);

  if (done) {
    return (
      <Screen>
        <Card style={{ alignItems: "center", gap: Spacing.md, padding: Spacing.xl }}>
          <View style={styles.okCircle}>
            <Check color={Colors.success} size={32} />
          </View>
          <Text style={styles.title}>Solicitação enviada!</Text>
          <Text style={[styles.body, { textAlign: "center" }]}>
            Nossa equipe vai analisar seus documentos e aprovar sua locação. Você receberá uma notificação no celular e no WhatsApp com o link do contrato.
          </Text>
          <Button
            label="Acompanhar no app"
            onPress={() => {
              router.replace("/(tabs)/inicio");
            }}
            style={{ alignSelf: "stretch" }}
          />
        </Card>
      </Screen>
    );
  }

  const validate = (): string | null => {
    if (step === 0) {
      if (!draft.vehicleId) return "Escolha o carro desejado.";
      const s = toIso(draft.startDate);
      const e = toIso(draft.endDate);
      if (!s || !e) return "Informe as datas de retirada e devolução no formato DD/MM/AAAA.";
      if (s < (summary?.today ?? "")) return "A data de retirada não pode ser no passado.";
      if (e <= s) return "A data de devolução precisa ser posterior à retirada.";
    }
    if (step === 1) {
      if (!draft.cnhNumber.trim() || draft.cnhNumber.trim().length < 8) return "Informe o número da CNH.";
      if (!draft.cnhCategory) return "Escolha a categoria da CNH.";
      const exp = toIso(draft.cnhExpiry);
      if (!exp) return "Informe a validade da CNH no formato DD/MM/AAAA.";
      if (exp < (summary?.today ?? "")) return "Sua CNH está vencida. Atualize para alugar.";
    }
    if (step === 2) {
      if (!draft.cnhFrontUri) return "Envie a foto da CNH (frente).";
      if (!draft.cnhBackUri) return "Envie a foto da CNH (verso).";
      if (!draft.addressProofUri) return "Envie o comprovante de residência recente.";
      if (!draft.selfieUri) return "Envie sua selfie segurando a CNH.";
    }
    return null;
  };

  const next = () => {
    const err = validate();
    setMessage(err);
    if (!err) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const send = async () => {
    setMessage(null);
    if (!summary?.client.id) return setMessage("Sessão não identificada. Entre novamente.");
    const clientId = summary.client.id;
    try {
      const docsToUpload: { key: string; uri: string; pathName: string }[] = [
        { key: "front", uri: draft.cnhFrontUri!, pathName: "cnh_front" },
        { key: "back", uri: draft.cnhBackUri!, pathName: "cnh_back" },
        { key: "address", uri: draft.addressProofUri!, pathName: "address_proof" },
        { key: "selfie", uri: draft.selfieUri!, pathName: "selfie" },
      ];

      const uploaded = { ...draft.uploaded };
      for (const [idx, item] of docsToUpload.entries()) {
        setProgress(`Enviando documentos (${idx + 1} de ${docsToUpload.length})...`);
        if (!uploaded[item.key]) {
          uploaded[item.key] = await uploadImage("documentos", `${clientId}/${item.pathName}_${newId()}.jpg`, item.uri);
          update({ uploaded });
        }
      }

      setProgress("Registrando sua solicitação...");
      await api("/api/tenant/requests", {
        method: "POST",
        body: {
          vehicleId: draft.vehicleId,
          startDate: toIso(draft.startDate),
          endDate: toIso(draft.endDate),
          planType: draft.planType,
          cnhNumber: draft.cnhNumber.trim(),
          cnhCategory: draft.cnhCategory,
          cnhExpiry: toIso(draft.cnhExpiry),
          cnhFrontPath: uploaded.front,
          cnhBackPath: uploaded.back,
          addressProofPath: uploaded.address,
          selfiePath: uploaded.selfie,
        },
      });

      await removeCache(DRAFT_KEY);
      await refresh();
      setDone(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
    setProgress(null);
  };

  return (
    <Screen>
      <View>
        <Text style={styles.kicker}>Passo {step + 1} de {STEPS.length}</Text>
        <Text style={styles.title}>{STEPS[step]}</Text>
        <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>
      </View>

      {step === 0 && (
        <>
          <Text style={styles.label}>1. Escolha o veículo desejado</Text>
          <View style={{ gap: Spacing.sm }}>
            {fleet.map((v) => {
              const on = draft.vehicleId === v.id;
              return (
                <TouchableOpacity key={v.id} onPress={() => update({ vehicleId: v.id })} style={[styles.carCard, on && styles.carCardOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <Image source={{ uri: v.image.startsWith("http") ? v.image : `${API_URL}${v.image}` }} style={styles.carImg} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.carName}>{v.name}</Text>
                    <Text style={styles.carSpecs}>
                      {v.category} · {v.transmission} · {v.fuel}
                    </Text>
                    <Text style={styles.carPrice}>
                      {v.weeklyRate ? `${money(v.weeklyRate)}/semana` : `${money(v.dailyRate)}/dia`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: Spacing.sm }]}>2. Período da locação</Text>
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Input label="Data de retirada" placeholder="DD/MM/AAAA" keyboardType="number-pad" value={draft.startDate} onChangeText={(t) => update({ startDate: maskDate(t) })} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Data de devolução" placeholder="DD/MM/AAAA" keyboardType="number-pad" value={draft.endDate} onChangeText={(t) => update({ endDate: maskDate(t) })} />
            </View>
          </View>

          <Text style={[styles.label, { marginTop: Spacing.sm }]}>3. Periodicidade do pagamento</Text>
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <TouchableOpacity onPress={() => update({ planType: "weekly" })} style={[styles.planBtn, draft.planType === "weekly" && styles.planBtnOn]} accessibilityRole="radio" accessibilityState={{ checked: draft.planType === "weekly" }}>
              <Text style={[styles.planText, draft.planType === "weekly" && styles.planTextOn]}>Semanal (recomendado)</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => update({ planType: "daily" })} style={[styles.planBtn, draft.planType === "daily" && styles.planBtnOn]} accessibilityRole="radio" accessibilityState={{ checked: draft.planType === "daily" }}>
              <Text style={[styles.planText, draft.planType === "daily" && styles.planTextOn]}>Diária</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 1 && (
        <Card style={{ gap: Spacing.md }}>
          <Input label="Número da CNH" placeholder="00000000000" keyboardType="number-pad" value={draft.cnhNumber} onChangeText={(t) => update({ cnhNumber: t.replace(/\D/g, "").slice(0, 15) })} />
          <View>
            <Text style={styles.label}>Categoria da CNH</Text>
            <View style={styles.catsRow}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat} onPress={() => update({ cnhCategory: cat })} style={[styles.catChip, draft.cnhCategory === cat && styles.catChipOn]} accessibilityRole="radio" accessibilityState={{ checked: draft.cnhCategory === cat }}>
                  <Text style={[styles.catText, draft.cnhCategory === cat && { color: Colors.text }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Input label="Validade da CNH" placeholder="DD/MM/AAAA" keyboardType="number-pad" value={draft.cnhExpiry} onChangeText={(t) => update({ cnhExpiry: maskDate(t) })} />
        </Card>
      )}

      {step === 2 && (
        <View style={{ gap: Spacing.md }}>
          <PhotoPicker label="1. CNH (frente)" hint="Foto nítida com boa iluminação." uri={draft.cnhFrontUri} onError={setMessage} onChange={(uri) => update({ cnhFrontUri: uri })} />
          <PhotoPicker label="2. CNH (verso)" hint="Mostre o verso completo da CNH." uri={draft.cnhBackUri} onError={setMessage} onChange={(uri) => update({ cnhBackUri: uri })} />
          <PhotoPicker label="3. Comprovante de endereço" hint="Conta de água, luz ou internet dos últimos 3 meses no seu nome." uri={draft.addressProofUri} onError={setMessage} onChange={(uri) => update({ addressProofUri: uri })} />
          <PhotoPicker label="4. Selfie com a CNH" hint="Segure sua CNH ao lado do rosto, mostrando que é você." uri={draft.selfieUri} onError={setMessage} onChange={(uri) => update({ selfieUri: uri })} />
        </View>
      )}

      {step === 3 && (
        <Card style={{ gap: Spacing.sm }}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Resumo da solicitação</Text>
            <ShieldCheck color={Colors.brandSoft} size={20} />
          </View>
          <View style={styles.divider} />
          <Row label="Veículo" value={selectedVehicle?.name ?? "Veículo"} />
          <Row label="Período" value={`${draft.startDate} até ${draft.endDate}`} />
          <Row label="Plano" value={draft.planType === "weekly" ? "Semanal" : "Diário"} />
          <Row label="Valor previsto" value={selectedVehicle ? (draft.planType === "weekly" ? `${money(selectedVehicle.weeklyRate)}/semana` : `${money(selectedVehicle.dailyRate)}/dia`) : "—"} />
          <Row label="Caução (a pagar na retirada)" value="R$ 1.000,00" />
          <Row label="CNH" value={`Nº ${draft.cnhNumber} (${draft.cnhCategory}) · Vence ${draft.cnhExpiry}`} />
          <Row label="Documentos anexados" value="4 de 4 anexados ✓" />
          <View style={styles.divider} />
          <Text style={styles.terms}>
            Ao tocar em &quot;Enviar solicitação&quot;, você declara que os documentos enviados são autênticos e autoriza a LOCAKAR a analisar seu perfil para emissão do contrato de locação.
          </Text>
        </Card>
      )}

      {message && (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      )}
      {progress && <Text style={styles.muted}>{progress}</Text>}

      <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm }}>
        {step > 0 && <Button label="Voltar" variant="outline" disabled={!!progress} onPress={() => { setMessage(null); setStep(step - 1); }} style={{ flex: 1 }} />}
        {step < STEPS.length - 1 ? (
          <Button label="Continuar" onPress={next} style={{ flex: 2 }} />
        ) : (
          <Button label={message ? "Tentar de novo" : "Enviar solicitação"} loading={!!progress} onPress={send} style={{ flex: 2 }} />
        )}
      </View>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: Spacing.md }}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.body, { fontWeight: "600", flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { color: Colors.brandSoft, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  title: { color: Colors.text, fontSize: 22, fontWeight: "700", marginTop: 2 },
  progress: { height: 4, backgroundColor: Colors.surfaceHover, borderRadius: 2, marginTop: Spacing.sm, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: Colors.magenta },
  body: { color: Colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  carCard: { flexDirection: "row", gap: Spacing.md, alignItems: "center", padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  carCardOn: { borderColor: Colors.magenta, backgroundColor: "#130A17" },
  carImg: { width: 90, height: 60, borderRadius: Radius.sm, backgroundColor: "#F4F4F5" },
  carName: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  carSpecs: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  carPrice: { color: Colors.brandSoft, fontSize: 14, fontWeight: "700", marginTop: 2 },
  planBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong, alignItems: "center" },
  planBtnOn: { borderColor: Colors.magenta, backgroundColor: Colors.brandGlow },
  planText: { color: Colors.textMuted, fontSize: 13, fontWeight: "600" },
  planTextOn: { color: Colors.text },
  catsRow: { flexDirection: "row", gap: Spacing.sm, marginTop: 6 },
  catChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong },
  catChipOn: { borderColor: Colors.magenta, backgroundColor: Colors.brandGlow },
  catText: { color: Colors.textMuted, fontWeight: "700", fontSize: 14 },
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  divider: { height: 1, backgroundColor: Colors.border },
  terms: { color: Colors.textSubtle, fontSize: 11, lineHeight: 16 },
  error: { color: Colors.danger, fontSize: 14, lineHeight: 20 },
  okCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.successSoft, alignItems: "center", justifyContent: "center" },
});
