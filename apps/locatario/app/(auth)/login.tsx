import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Colors, Spacing } from "../../constants/theme";
import { supabase } from "../../services/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const login = async () => {
    setMessage(null);
    if (!email.trim() || !password) return setMessage({ tone: "error", text: "Informe e-mail e senha." });
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (error) {
      const unconfirmed = /confirm/i.test(error.message);
      setMessage({ tone: "error", text: unconfirmed ? "Confirme seu e-mail pelo link que enviamos antes de entrar." : "E-mail ou senha incorretos." });
    }
    // Com sucesso, o Gate (app/_layout.tsx) leva para a tela certa.
  };

  const forgot = async () => {
    setMessage(null);
    if (!email.trim()) return setMessage({ tone: "error", text: "Digite seu e-mail acima e toque em \"Esqueci minha senha\" de novo." });
    const redirectUrl =
      Platform.OS === "web" && typeof window !== "undefined"
        ? `${window.location.origin}/locatario`
        : "https://www.locakar.com.br/locatario";
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: redirectUrl,
    });
    setMessage(error ? { tone: "error", text: "Não foi possível enviar o e-mail. Tente de novo em alguns minutos." } : { tone: "info", text: `Se houver uma conta com ${email.trim()}, enviamos um link para criar uma nova senha.` });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>
              LOCA<Text style={{ color: Colors.brandSoft }}>KAR</Text>
            </Text>
            <Text style={styles.title}>Entrar</Text>
            <Text style={styles.subtitle}>Acompanhe sua locação, pague com PIX e envie comprovantes.</Text>
          </View>

          <View style={styles.form}>
            <Input label="E-mail" placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" value={email} onChangeText={setEmail} />
            <Input label="Senha" placeholder="Sua senha" secureTextEntry autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} onSubmitEditing={login} />
            {message && (
              <Text style={[styles.message, message.tone === "error" ? { color: Colors.danger } : { color: Colors.success }]} accessibilityRole="alert">
                {message.text}
              </Text>
            )}
            <Button label="Entrar" size="lg" loading={loading} onPress={login} />
            <Button label="Esqueci minha senha" variant="ghost" onPress={forgot} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.muted}>Primeiro acesso?</Text>
            <Link href="/(auth)/cadastro" style={styles.link}>
              Criar conta com o e-mail cadastrado na LOCAKAR
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, padding: Spacing.xl, justifyContent: "center", maxWidth: 480, width: "100%", alignSelf: "center" },
  header: { marginBottom: Spacing.xl },
  brand: { fontSize: 28, fontWeight: "900", color: Colors.text, letterSpacing: 2, marginBottom: Spacing.lg },
  title: { fontSize: 26, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, marginTop: 4 },
  form: { gap: Spacing.md },
  message: { fontSize: 14, lineHeight: 20 },
  footer: { marginTop: Spacing.xl, alignItems: "center", gap: 4 },
  muted: { color: Colors.textMuted, fontSize: 14 },
  link: { color: Colors.brandSoft, fontWeight: "700", fontSize: 14, textAlign: "center" },
});
