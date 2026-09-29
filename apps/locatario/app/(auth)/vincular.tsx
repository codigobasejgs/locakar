import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { whatsappUrl } from "../../constants/company";
import { Spacing, Type } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useLocatario } from "../../hooks/useLocatario";

/**
 * Conta criada, mas ainda sem locação ativa na LOCAKAR.
 */
export default function VincularScreen() {
  const router = useRouter();
  const { session, refresh, signOut } = useLocatario();
  const { colors } = useTheme();
  const [checking, setChecking] = useState(false);
  const confirmed = Boolean(session?.user.email_confirmed_at);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.text }]}>{confirmed ? "Bem-vindo à LOCAKAR" : "Confirme seu e-mail"}</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>
          {confirmed
            ? `Sua conta (${session?.user.email}) está ativa. Se você já tem uma locação em andamento, verifique seu cadastro. Se for um novo cliente, escolha seu veículo e solicite sua locação.`
            : `Enviamos um link para ${session?.user.email}. Abra o e-mail, toque no link e volte aqui.`}
        </Text>
        {confirmed && (
          <Button
            label="Escolher veículo e solicitar locação"
            onPress={() => router.push("/solicitar")}
          />
        )}
        <Button
          label={checking ? "Verificando..." : "Verificar cadastro novamente"}
          variant="outline"
          loading={checking}
          onPress={async () => {
            setChecking(true);
            await refresh();
            setChecking(false);
          }}
        />
        <Button label="Falar com a LOCAKAR no WhatsApp" variant="ghost" onPress={() => Linking.openURL(whatsappUrl(undefined, "Olá, LOCAKAR! Criei minha conta no app."))} />
        <Button label="Sair" variant="ghost" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, justifyContent: "center", padding: Spacing.xl, gap: Spacing.md, maxWidth: 520, width: "100%", alignSelf: "center" },
  title: { ...Type.display, fontSize: 24, lineHeight: 30 },
  text: { fontSize: 15, lineHeight: 22, marginBottom: Spacing.sm },
});
