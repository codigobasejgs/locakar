import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { PhotoPicker } from "../components/domain/PhotoPicker";
import { Screen } from "../components/domain/Screen";
import { SignaturePad } from "../components/domain/SignaturePad";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { DAMAGE_SLOT, FUEL, INSPECTION_ITEMS, INSPECTION_KIND, MAX_DAMAGE_PHOTOS, PHOTO_SLOTS, type FuelLevel } from "../constants/tenant";
import { Colors, Radius, Spacing } from "../constants/theme";
import { useLocatario } from "../hooks/useLocatario";
import { api } from "../services/api";
import { readCache, removeCache, writeCache } from "../services/cache";
import { newId, uploadImage } from "../services/upload";

/** Rascunho salvo no aparelho a cada passo: sem internet no pátio, nada se perde. */
interface Draft {
  requestId: string;
  rentalId: string;
  kind: string;
  km: string;
  fuel: FuelLevel | null;
  items: Record<string, { ok: boolean | null; note: string }>;
  photos: Record<string, string>; // slot → uri local
  damagePhotos: string[];
  damages: string;
  notes: string;
  uploaded: Record<string, string>; // uri local → caminho no Storage (reenvio não sobe de novo)
}

const STEPS = ["Dados", "Quilometragem", "Combustível", "Checklist", "Fotos", "Avarias", "Assinatura", "Confirmar"];

function emptyDraft(rentalId: string, kind: string): Draft {
  return {
    requestId: newId(),
    rentalId,
    kind,
    km: "",
    fuel: null,
    items: Object.fromEntries(INSPECTION_ITEMS.map((i) => [i.key, { ok: null, note: "" }])),
    photos: {},
    damagePhotos: [],
    damages: "",
    notes: "",
    uploaded: {},
  };
}

export default function VistoriaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { activeRental: rental, summary, refresh } = useLocatario();
  const kind = params.kind && params.kind in INSPECTION_KIND ? params.kind : rental?.delivery ? "periodic" : "delivery";
  const draftKey = `vistoria:${rental?.id}:${kind}`;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState(0);
  const [signature, setSignature] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!rental || loaded.current) return;
    loaded.current = true;
    readCache<Draft>(draftKey).then((saved) => setDraft(saved ?? emptyDraft(rental.id, kind)));
  }, [rental, draftKey, kind]);

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      writeCache(draftKey, next);
      return next;
    });

  if (!rental || !summary) return <Screen><Text style={styles.body}>Nenhuma locação encontrada.</Text></Screen>;
  if (!draft) return <Screen loading>{null}</Screen>;

  if (done) {
    return (
      <Screen>
        <Card style={{ alignItems: "center", gap: Spacing.md, padding: Spacing.xl }}>
          <View style={styles.okCircle}>
            <Check color={Colors.success} size={32} />
          </View>
          <Text style={styles.title}>Vistoria enviada</Text>
          <Text style={[styles.body, { textAlign: "center" }]}>A LOCAKAR vai conferir as fotos. Você recebe um aviso quando for conferida.</Text>
          <Button label="Voltar" onPress={() => router.back()} style={{ alignSelf: "stretch" }} />
        </Card>
      </Screen>
    );
  }

  const km = Number(draft.km.replace(/\D/g, ""));
  const minKm = kind === "delivery" ? 0 : (rental.kmStart ?? rental.delivery?.km ?? 0);
  const missingItems = INSPECTION_ITEMS.filter((i) => draft.items[i.key]?.ok == null);
  const missingPhotos = PHOTO_SLOTS.filter((s) => !draft.photos[s.key]);

  const validate = (): string | null => {
    if (step === 1 && (!draft.km || km < minKm)) return minKm ? `Informe a quilometragem do painel (no mínimo ${minKm.toLocaleString("pt-BR")} km).` : "Informe a quilometragem do painel.";
    if (step === 2 && !draft.fuel) return "Escolha o nível de combustível.";
    if (step === 3 && missingItems.length) return `Marque todos os itens (faltam ${missingItems.length}).`;
    if (step === 4 && missingPhotos.length) return `Faltam fotos: ${missingPhotos.map((s) => s.label).join(", ")}.`;
    if (step === 6 && !signature) return "Assine com o dedo para confirmar.";
    return null;
  };

  const next = () => {
    const err = validate();
    setMessage(err);
    if (!err) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const send = async () => {
    setMessage(null);
    try {
      // Sobe cada foto uma vez (reenvio após falha só sobe o que faltou).
      const all: { slot: string; uri: string }[] = [
        ...PHOTO_SLOTS.map((s) => ({ slot: s.key, uri: draft.photos[s.key] })),
        ...draft.damagePhotos.map((uri) => ({ slot: DAMAGE_SLOT, uri })),
      ];
      const uploaded = { ...draft.uploaded };
      for (const [n, p] of all.entries()) {
        setProgress(`Enviando fotos (${n + 1} de ${all.length})...`);
        if (!uploaded[p.uri]) {
          uploaded[p.uri] = await uploadImage("vistorias", `${rental.id}/app/${draft.requestId}/${p.slot}_${n}.jpg`, p.uri);
          update({ uploaded });
        }
      }
      setProgress("Registrando a vistoria...");
      await api("/api/tenant/inspections", {
        method: "POST",
        body: {
          requestId: draft.requestId,
          rentalId: rental.id,
          kind,
          km,
          fuel: draft.fuel,
          items: INSPECTION_ITEMS.map((i) => ({ key: i.key, ok: draft.items[i.key].ok, note: draft.items[i.key].note })),
          photos: all.map((p) => ({ slot: p.slot, path: uploaded[p.uri] })),
          damages: draft.damages,
          notes: draft.notes,
          signature,
        },
      });
      await removeCache(draftKey);
      refresh();
      setDone(true);
    } catch (e) {
      setMessage(`${(e as Error).message} Seu rascunho está salvo no celular: toque em Enviar de novo quando tiver internet.`);
    }
    setProgress(null);
  };

  return (
    <Screen>
      <View>
        <Text style={styles.kicker}>
          {INSPECTION_KIND[kind]} · passo {step + 1} de {STEPS.length}
        </Text>
        <Text style={styles.title}>{STEPS[step]}</Text>
        <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: STEPS.length, now: step + 1 }}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>
      </View>

      {step === 0 && (
        <Card style={{ gap: Spacing.sm }}>
          <Text style={styles.body}>Confira se é este o carro que está com você:</Text>
          <Text style={styles.car}>{rental.vehicle?.name ?? "Veículo"}</Text>
          <Text style={styles.plate}>{rental.vehicle?.plate ?? "—"}</Text>
          <Text style={styles.muted}>Você vai informar a quilometragem, o combustível, conferir 10 itens e tirar {PHOTO_SLOTS.length} fotos. Leva uns 5 minutos. Se a internet cair, continue: o rascunho fica salvo.</Text>
        </Card>
      )}

      {step === 1 && (
        <Input
          label="Quilometragem no painel"
          placeholder="Ex.: 45230"
          keyboardType="number-pad"
          value={draft.km}
          onChangeText={(t) => update({ km: t.replace(/\D/g, "").slice(0, 7) })}
          hint={minKm ? `Na retirada: ${minKm.toLocaleString("pt-BR")} km.` : undefined}
        />
      )}

      {step === 2 && (
        <View style={styles.fuelRow} accessibilityRole="radiogroup">
          {FUEL.map((f) => (
            <TouchableOpacity key={f.key} onPress={() => update({ fuel: f.key })} style={[styles.fuel, draft.fuel === f.key && styles.fuelOn]} accessibilityRole="radio" accessibilityState={{ checked: draft.fuel === f.key }}>
              <Text style={[styles.fuelText, draft.fuel === f.key && { color: Colors.text }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {step === 3 &&
        INSPECTION_ITEMS.map((it) => {
          const v = draft.items[it.key];
          const set = (patch: Partial<typeof v>) => update({ items: { ...draft.items, [it.key]: { ...v, ...patch } } });
          return (
            <Card key={it.key} style={{ gap: Spacing.sm }}>
              <Text style={styles.itemLabel}>{it.label}</Text>
              <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                <TouchableOpacity onPress={() => set({ ok: true })} style={[styles.choice, v.ok === true && styles.choiceOk]} accessibilityRole="radio" accessibilityState={{ checked: v.ok === true }} accessibilityLabel={`${it.label}: OK`}>
                  <Check color={v.ok === true ? Colors.success : Colors.textMuted} size={18} />
                  <Text style={styles.choiceText}>OK</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => set({ ok: false })} style={[styles.choice, v.ok === false && styles.choiceBad]} accessibilityRole="radio" accessibilityState={{ checked: v.ok === false }} accessibilityLabel={`${it.label}: com problema`}>
                  <X color={v.ok === false ? Colors.danger : Colors.textMuted} size={18} />
                  <Text style={styles.choiceText}>Problema</Text>
                </TouchableOpacity>
              </View>
              {v.ok === false && (
                <TextInput style={styles.note} placeholder="O que tem? (opcional)" placeholderTextColor={Colors.textSubtle} value={v.note} maxLength={200} onChangeText={(note) => set({ note })} />
              )}
            </Card>
          );
        })}

      {step === 4 &&
        PHOTO_SLOTS.map((s) => (
          <PhotoPicker key={s.key} label={s.label} hint={s.hint} uri={draft.photos[s.key] ?? null} onError={setMessage} onChange={(uri) => {
            const photos = { ...draft.photos };
            if (uri) photos[s.key] = uri;
            else delete photos[s.key];
            update({ photos });
          }} />
        ))}

      {step === 5 && (
        <>
          <Input label="Avarias encontradas (se houver)" placeholder="Ex.: risco na porta traseira direita" value={draft.damages} onChangeText={(damages) => update({ damages })} multiline maxLength={1000} />
          {draft.damagePhotos.map((uri, n) => (
            <PhotoPicker key={uri} label={`Foto da avaria ${n + 1}`} uri={uri} onError={setMessage} onChange={(u) => update({ damagePhotos: u ? draft.damagePhotos.map((x, i) => (i === n ? u : x)) : draft.damagePhotos.filter((_, i) => i !== n) })} />
          ))}
          {draft.damagePhotos.length < MAX_DAMAGE_PHOTOS && (
            <PhotoPicker label="Adicionar foto de avaria" hint="De perto, com boa luz." uri={null} onError={setMessage} onChange={(u) => u && update({ damagePhotos: [...draft.damagePhotos, u] })} />
          )}
          <Input label="Observações" placeholder="Algo mais que a LOCAKAR precisa saber?" value={draft.notes} onChangeText={(notes) => update({ notes })} multiline maxLength={1000} />
        </>
      )}

      {step === 6 && (
        <>
          <Text style={styles.body}>Assinando, você confirma que as informações e fotos mostram o estado real do veículo agora.</Text>
          <SignaturePad onChange={setSignature} />
        </>
      )}

      {step === 7 && (
        <Card style={{ gap: Spacing.sm }}>
          <Row label="Veículo" value={`${rental.vehicle?.name ?? "—"} · ${rental.vehicle?.plate ?? ""}`} />
          <Row label="Quilometragem" value={`${km.toLocaleString("pt-BR")} km`} />
          <Row label="Combustível" value={FUEL.find((f) => f.key === draft.fuel)?.label ?? "—"} />
          <Row label="Itens com problema" value={String(INSPECTION_ITEMS.filter((i) => draft.items[i.key].ok === false).length)} />
          <Row label="Fotos" value={String(PHOTO_SLOTS.length + draft.damagePhotos.length)} />
        </Card>
      )}

      {message && (
        <Text style={styles.error} accessibilityRole="alert">
          {message}
        </Text>
      )}
      {progress && <Text style={styles.muted}>{progress}</Text>}

      <View style={{ flexDirection: "row", gap: Spacing.sm }}>
        {step > 0 && <Button label="Voltar" variant="outline" disabled={!!progress} onPress={() => { setMessage(null); setStep(step - 1); }} style={{ flex: 1 }} />}
        {step < STEPS.length - 1 ? (
          <Button label="Continuar" onPress={next} style={{ flex: 2 }} />
        ) : (
          <Button label={message ? "Enviar de novo" : "Enviar vistoria"} loading={!!progress} onPress={send} style={{ flex: 2 }} />
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
  body: { color: Colors.text, fontSize: 15, lineHeight: 22 },
  muted: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  car: { color: Colors.text, fontSize: 20, fontWeight: "700" },
  plate: { color: Colors.brandSoft, fontSize: 15, fontWeight: "700", letterSpacing: 1 },
  fuelRow: { flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" },
  fuel: { flexGrow: 1, flexBasis: "18%", alignItems: "center", paddingVertical: Spacing.lg, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong },
  fuelOn: { borderColor: Colors.magenta, backgroundColor: Colors.brandGlow },
  fuelText: { color: Colors.textMuted, fontWeight: "700", fontSize: 15 },
  itemLabel: { color: Colors.text, fontSize: 15, fontWeight: "600" },
  choice: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong },
  choiceOk: { borderColor: Colors.success, backgroundColor: Colors.successSoft },
  choiceBad: { borderColor: Colors.danger, backgroundColor: Colors.dangerSoft },
  choiceText: { color: Colors.text, fontWeight: "600" },
  note: { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, color: Colors.text, fontSize: 15 },
  error: { color: Colors.danger, fontSize: 14, lineHeight: 20 },
  okCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.successSoft, alignItems: "center", justifyContent: "center" },
});
