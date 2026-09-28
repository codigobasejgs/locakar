import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { whatsappUrl } from "../../constants/company";
import { Colors, Spacing } from "../../constants/theme";
import { useLocatario } from "../../hooks/useLocatario";

/**
 * Conta criada, mas ainda sem vínculo com um cadastro da LOCAKAR.
 * O vínculo exige e-mail confirmado, igual ao do cadastro na locadora, e o mesmo CPF.
 */
export default function VincularScreen() {
  const { session, refresh, signOut } = useLocatario();
  const [checking, setChecking] = useState(false);
  const confirmed = Boolean(session?.user.email_confirmed_at);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title}>{confirmed ? "Não encontramos seu cadastro" : "Confirme seu e-mail"}</Text>
        <Text style={styles.text}>
          {confirmed
            ? `Sua conta (${session?.user.email}) não corresponde a um cadastro da LOCAKAR. O e-mail e o CPF precisam ser os mesmos informados na locadora. Fale com a gente para conferir.`
            : `Enviamos um link para ${session?.user.email}. Abra o e-mail, toque no link e volte aqui.`}
        </Text>
        <Button
          label={checking ? "Verificando..." : "Já fiz, verificar de novo"}
          loading={checking}
          onPress={async () => {
            setChecking(true);
            await refresh();
            setChecking(false);
          }}
        />
        <Button label="Falar com a LOCAKAR no WhatsApp" variant="outline" onPress={() => Linking.openURL(whatsappUrl(undefined, "Olá, LOCAKAR! Criei minha conta no app e preciso vincular ao meu cadastro."))} />
        <Button label="Sair" variant="ghost" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, justifyContent: "center", padding: Spacing.xl, gap: Spacing.md },
  title: { color: Colors.text, fontSize: 24, fontWeight: "700" },
  text: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, marginBottom: Spacing.sm },
});
