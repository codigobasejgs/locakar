import { Check } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Screen } from "../components/domain/Screen";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { date } from "../constants/format";
import { Radius, Spacing, type ThemeColors } from "../constants/theme";
import { useTheme } from "../context/ThemeProvider";
import { useThemedStyles } from "../hooks/useThemedStyles";
import { useLocatario } from "../hooks/useLocatario";
import { acceptPrivacy } from "../services/device";
import { useBrandName } from "../context/OrgProvider";

/** O que o app coleta e por quê (LGPD). Mesmo texto do aceite gravado em tenant_consents. */
const sections = (brandName: string): [string, string][] => [
  ["Seus dados da locação", "Cadastro, locações, pagamentos, vistorias, ocorrências e documentos que você envia. Usamos para prestar o serviço de locação e cobrar o que foi contratado."],
  ["Fotos e documentos", `Comprovantes, fotos da vistoria, de ocorrências e dos seus documentos ficam em armazenamento privado. Só você e a equipe da ${brandName} veem, por links que expiram em minutos.`],
  ["Segurança do aparelho", "Para proteger sua conta contra fraude registramos: modelo e sistema do celular, versão do app, se é um emulador, a verificação de integridade do app (Google Play) e o endereço IP das conexões. Nada disso bloqueia sua conta automaticamente: uma pessoa da equipe sempre analisa."],
  ["O que NÃO coletamos", "Localização, contatos, outros aplicativos, arquivos do celular, microfone ou câmera fora do momento em que você tira uma foto."],
  ["Por quanto tempo", "Sinais de segurança: 180 dias. Registros da locação e comprovantes: pelo prazo exigido em lei (fiscal e contratual). Aparelhos desconectados: 1 ano."],
  ["Seus direitos", `Você pode pedir acesso, correção ou exclusão dos seus dados e revogar as notificações a qualquer momento, pelo WhatsApp da ${brandName}.`],
];

export default function PrivacidadeScreen() {
  const brandName = useBrandName();
  const styles = useThemedStyles(makeStyles);
  const { summary, refresh } = useLocatario();
  const [push, setPush] = useState(true);
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accepted = summary?.consent;

  const accept = async () => {
    setSending(true);
    setError(null);
    try {
      await acceptPrivacy(["essential", "security_telemetry", ...(push ? ["push"] : [])]);
      await refresh(); // o Gate leva para o início
    } catch (e) {
      setError((e as Error).message);
    }
    setSending(false);
  };

  return (
    <Screen>
      <View>
        <Text style={styles.title}>Privacidade e segurança</Text>
        <Text style={styles.muted}>Política versão {summary?.privacyVersion ?? "—"}. Leia antes de continuar.</Text>
      </View>

      {sections(brandName).map(([title, text]) => (
        <Card key={title} style={{ gap: 4 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.body}>{text}</Text>
        </Card>
      ))}

      {accepted ? (
        <Card style={{ gap: 4 }}>
          <Text style={styles.cardTitle}>Aceite registrado</Text>
          <Text style={styles.body}>
            Em {date(accepted.at)}. Notificações no celular: {accepted.scopes.includes("push") ? "ativadas" : "desativadas"}.
          </Text>
        </Card>
      ) : (
        <>
          <Toggle checked={push} onPress={() => setPush(!push)} label={`Quero receber notificações no celular (cobranças, aprovações, respostas da ${brandName}). Opcional.`} />
          <Toggle checked={agree} onPress={() => setAgree(!agree)} label="Li e concordo com o uso dos meus dados descrito acima, inclusive os sinais de segurança do aparelho." />
          {error && (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
          <Button label="Continuar" disabled={!agree} loading={sending} onPress={accept} />
        </>
      )}
    </Screen>
  );
}

function Toggle({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  const { colors: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity onPress={onPress} style={styles.toggle} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked && <Check color={Colors.text} size={16} />}</View>
      <Text style={[styles.body, { flex: 1 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
  title: { color: Colors.text, fontSize: 24, fontWeight: "700" },
  muted: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: "700" },
  body: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  toggle: { flexDirection: "row", gap: Spacing.md, alignItems: "flex-start", paddingVertical: Spacing.sm },
  box: { width: 24, height: 24, borderRadius: Radius.sm, borderWidth: 2, borderColor: Colors.borderStrong, alignItems: "center", justifyContent: "center", marginTop: 1 },
  boxOn: { backgroundColor: Colors.magenta, borderColor: Colors.brandSoft },
  error: { color: Colors.danger, fontSize: 14 },
});
