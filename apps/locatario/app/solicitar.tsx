import { useRouter, useLocalSearchParams } from "expo-router";
import { Check, ShieldCheck } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { PhotoPicker } from "../components/domain/PhotoPicker";
import { Screen } from "../components/domain/Screen";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { money } from "../constants/format";
import { Radius, Spacing, type ThemeColors } from "../constants/theme";
import { useTheme } from "../context/ThemeProvider";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { useLocatario } from "../hooks/useLocatario";
import { API_URL, api, type FleetVehicle } from "../services/api";
import { readCache, removeCache, writeCache } from "../services/cache";
import { fetchAddressByCep } from "../services/cep";
import { newId, uploadImage } from "../services/upload";

function toIso(v: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[1]) ? null : iso;
}
const maskDate = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
const maskCep = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
const maskPhone = (v: string) => v.replace(/\D/g, "").slice(0, 11).replace(/^(\d{2})(\d)/g, "($1) $2").replace(/(\d{5})(\d{4})$/, "$1-$2");

interface Draft {
  vehicleId: string;
  startDate: string;
  endDate: string;
  planType: "daily" | "weekly" | "monthly" | "annual";
  kmDaily: string;
  kmMonthly: string;
  backupPhone: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
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
const STEPS = ["Veículo e período", "Uso e endereço", "Habilitação (CNH)", "Documentos", "Revisão e envio"];
const CATEGORIES = ["B", "AB", "A", "C", "D", "E"] as const;

export default function SolicitarLocacaoScreen() {
  const { colors: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string }>();
  const { summary, refresh } = useLocatario();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    vehicleId: params.vehicleId ?? "",
    startDate: "",
    endDate: "",
    planType: "weekly",
    kmDaily: "80",
    kmMonthly: "2400",
    backupPhone: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
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
  const [lookingUpCep, setLookingUpCep] = useState(false);
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

  const handleCep = async (val: string) => {
    const masked = maskCep(val);
    update({ cep: masked });
    const clean = val.replace(/\D/g, "");
    if (clean.length === 8) {
      setLookingUpCep(true);
      try {
        const addr = await fetchAddressByCep(clean);
        if (addr) {
          update({
            cep: masked,
            street: addr.street,
            neighborhood: addr.neighborhood,
            city: addr.city,
            state: addr.state,
          });
        }
      } catch {
        /* silencioso */
      }
      setLookingUpCep(false);
    }
  };

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
      if (!draft.cep.replace(/\D/g, "") || draft.cep.replace(/\D/g, "").length < 8) return "Informe seu CEP.";
      if (!draft.street.trim()) return "Informe o logradouro / rua.";
      if (!draft.number.trim()) return "Informe o número da residência.";
      if (!draft.city.trim()) return "Informe a cidade.";
      if (!draft.state.trim()) return "Informe o estado (UF).";
    }
    if (step === 2) {
      if (!draft.cnhNumber.trim() || draft.cnhNumber.trim().length < 8) return "Informe o número da CNH.";
      if (!draft.cnhCategory) return "Escolha a categoria da CNH.";
      const exp = toIso(draft.cnhExpiry);
      if (!exp) return "Informe a validade da CNH no formato DD/MM/AAAA.";
      if (exp < (summary?.today ?? "")) return "Sua CNH está vencida. Atualize para alugar.";
    }
    if (step === 3) {
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
          kmDaily: Number(draft.kmDaily) || undefined,
          kmMonthly: Number(draft.kmMonthly) || undefined,
          backupPhone: draft.backupPhone || undefined,
          cep: draft.cep,
          street: draft.street,
          number: draft.number,
          complement: draft.complement,
          neighborhood: draft.neighborhood,
          city: draft.city,
          state: draft.state,
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

      {/* Passo 0: Veículo e Período */}
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
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm }}>
            {(
              [
                ["daily", "Diária"],
                ["weekly", "Semanal"],
                ["monthly", "Mensal"],
                ["annual", "Anual"],
              ] as const
            ).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                onPress={() => update({ planType: key })}
                style={[styles.planBtn, draft.planType === key && styles.planBtnOn, { flexBasis: "48%" }]}
                accessibilityRole="radio"
                accessibilityState={{ checked: draft.planType === key }}
              >
                <Text style={[styles.planText, draft.planType === key && styles.planTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Passo 1: Uso e Endereço */}
      {step === 1 && (
        <Card style={{ gap: Spacing.md }}>
          <View>
            <Text style={styles.label}>Previsão de uso do veículo</Text>
            <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Input label="KM Médio / dia" placeholder="80" keyboardType="number-pad" value={draft.kmDaily} onChangeText={(t) => update({ kmDaily: t.replace(/\D/g, "") })} />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="KM Médio / mês" placeholder="2400" keyboardType="number-pad" value={draft.kmMonthly} onChangeText={(t) => update({ kmMonthly: t.replace(/\D/g, "") })} />
              </View>
            </View>
          </View>

          <Input label="Telefone de recado / reserva (opcional)" placeholder="(00) 00000-0000" keyboardType="phone-pad" value={draft.backupPhone} onChangeText={(t) => update({ backupPhone: maskPhone(t) })} />

          <View style={styles.divider} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={styles.label}>Endereço de residência</Text>
            {lookingUpCep && <Text style={{ fontSize: 11, color: Colors.brandSoft }}>Buscando CEP...</Text>}
          </View>

          <Input label="CEP" placeholder="00000-000" keyboardType="number-pad" value={draft.cep} onChangeText={handleCep} maxLength={9} />
          <Input label="Logradouro / Rua" placeholder="Rua, Avenida..." value={draft.street} onChangeText={(t) => update({ street: t })} />
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <View style={{ width: 100 }}>
              <Input label="Número" placeholder="123" value={draft.number} onChangeText={(t) => update({ number: t })} />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Complemento" placeholder="Apto, Bloco..." value={draft.complement} onChangeText={(t) => update({ complement: t })} />
            </View>
          </View>
          <Input label="Bairro" placeholder="Bairro" value={draft.neighborhood} onChangeText={(t) => update({ neighborhood: t })} />
          <View style={{ flexDirection: "row", gap: Spacing.sm }}>
            <View style={{ flex: 2 }}>
              <Input label="Cidade" placeholder="Cidade" value={draft.city} onChangeText={(t) => update({ city: t })} />
            </View>
            <View style={{ width: 80 }}>
              <Input label="UF" placeholder="SP" autoCapitalize="characters" maxLength={2} value={draft.state} onChangeText={(t) => update({ state: t.toUpperCase() })} />
            </View>
          </View>
        </Card>
      )}

      {/* Passo 2: Habilitação */}
      {step === 2 && (
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

      {/* Passo 3: Documentos */}
      {step === 3 && (
        <View style={{ gap: Spacing.md }}>
          <PhotoPicker label="1. CNH (frente)" hint="Foto nítida com boa iluminação." uri={draft.cnhFrontUri} onError={setMessage} onChange={(uri) => update({ cnhFrontUri: uri })} />
          <PhotoPicker label="2. CNH (verso)" hint="Mostre o verso completo da CNH." uri={draft.cnhBackUri} onError={setMessage} onChange={(uri) => update({ cnhBackUri: uri })} />
          <PhotoPicker label="3. Comprovante de endereço" hint="Conta de água, luz ou internet dos últimos 3 meses no seu nome." uri={draft.addressProofUri} onError={setMessage} onChange={(uri) => update({ addressProofUri: uri })} />
          <PhotoPicker label="4. Selfie com a CNH" hint="Segure sua CNH ao lado do rosto, mostrando que é você." uri={draft.selfieUri} onError={setMessage} onChange={(uri) => update({ selfieUri: uri })} />
        </View>
      )}

      {/* Passo 4: Revisão */}
      {step === 4 && (
        <Card style={{ gap: Spacing.sm }}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Resumo da solicitação</Text>
            <ShieldCheck color={Colors.brandSoft} size={20} />
          </View>
          <View style={styles.divider} />
          <Row label="Veículo" value={selectedVehicle?.name ?? "Veículo"} />
          <Row label="Período" value={`${draft.startDate} até ${draft.endDate}`} />
          <Row
            label="Plano"
            value={
              draft.planType === "daily"
                ? "Diário"
                : draft.planType === "weekly"
                ? "Semanal"
                : draft.planType === "monthly"
                ? "Mensal"
                : "Anual"
            }
          />
          <Row
            label="Valor previsto"
            value={
              selectedVehicle
                ? draft.planType === "daily"
                  ? `${money(selectedVehicle.dailyRate ?? 120)}/dia`
                  : draft.planType === "weekly"
                  ? `${money(selectedVehicle.weeklyRate ?? 650)}/semana`
                  : draft.planType === "monthly"
                  ? `${money((selectedVehicle.weeklyRate ?? 650) * 4)}/mês`
                  : `${money((selectedVehicle.weeklyRate ?? 650) * 52)}/ano`
                : "—"
            }
          />
          <Row label="Endereço" value={`${draft.street}, ${draft.number} - ${draft.city}/${draft.state}`} />
          <Row label="KM previsto" value={`${draft.kmDaily} km/dia (~${draft.kmMonthly} km/mês)`} />
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
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: Spacing.md }}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.body, { fontWeight: "600", flexShrink: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
  kicker: { color: Colors.brandSoft, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  title: { color: Colors.text, fontSize: 22, fontWeight: "700", marginTop: 2 },
  progress: { height: 4, backgroundColor: Colors.surfaceHover, borderRadius: 2, marginTop: Spacing.sm, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: Colors.magenta },
  body: { color: Colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "600", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  carCard: { flexDirection: "row", gap: Spacing.md, alignItems: "center", padding: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  carCardOn: { borderColor: Colors.brandSoft, backgroundColor: Colors.brandTint },
  carImg: { width: 90, height: 60, borderRadius: Radius.sm, backgroundColor: Colors.surfaceElevated },
  carName: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  carSpecs: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  carPrice: { color: Colors.brandSoft, fontSize: 14, fontWeight: "700", marginTop: 2 },
  planBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong, alignItems: "center" },
  planBtnOn: { borderColor: Colors.brandSoft, backgroundColor: Colors.brandTint },
  planText: { color: Colors.textMuted, fontSize: 13, fontWeight: "600" },
  planTextOn: { color: Colors.text },
  catsRow: { flexDirection: "row", gap: Spacing.sm, marginTop: 6 },
  catChip: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong },
  catChipOn: { borderColor: Colors.brandSoft, backgroundColor: Colors.brandTint },
  catText: { color: Colors.textMuted, fontWeight: "700", fontSize: 14 },
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  divider: { height: 1, backgroundColor: Colors.border },
  terms: { color: Colors.textSubtle, fontSize: 11, lineHeight: 16 },
  error: { color: Colors.danger, fontSize: 14, lineHeight: 20 },
  okCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.successSoft, alignItems: "center", justifyContent: "center" },
});
