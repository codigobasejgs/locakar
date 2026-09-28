import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Colors, Spacing } from "../../constants/theme";
import { supabase } from "../../services/supabase";

// Mesma regra de src/lib/utils.ts (dígitos verificadores do CPF).
const maskCPF = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const maskPhone = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/^(\d{2})(\d)/g, "($1) $2")
    .replace(/(\d{5})(\d{4})$/, "$1-$2");

function isValidCPF(value: string) {
  const d = value.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digit = (n: string) => {
    const sum = [...n].reduce((a, x, i) => a + Number(x) * (n.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const first = digit(d.slice(0, 9));
  return `${first}${digit(d.slice(0, 9) + first)}` === d.slice(9);
}

export default function CadastroScreen() {
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const register = async () => {
    setError(null);
    if (name.trim().length < 3) return setError("Informe seu nome completo.");
    if (!isValidCPF(cpf)) return setError("CPF inválido.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Informe um WhatsApp válido.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("E-mail inválido.");
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    setLoading(true);
    const redirectUrl =
      Platform.OS === "web" && typeof window !== "undefined"
        ? `${window.location.origin}/locatario`
        : "https://www.locakar.com.br/locatario";

    const { data: signUpData, error: err } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          name: name.trim(),
          phone: maskPhone(phone),
          cpf: cpf.replace(/\D/g, ""),
        },
        emailRedirectTo: redirectUrl,
      },
    });
    setLoading(false);
    if (err) {
      if (err.status === 429 || /rate limit/i.test(err.message)) {
        return setError("Limite de envio de e-mails atingido no Supabase. Desative 'Confirm email' em Authentication > Providers > Email no painel do Supabase para criar a conta na hora.");
      }
      return setError(
        /registered|exists/i.test(err.message)
          ? "Já existe uma conta com este e-mail. Entre ou use \"Esqueci minha senha\"."
          : err.message || "Não foi possível criar a conta. Tente de novo."
      );
    }
    // Se "Confirm email" estiver desativado no Supabase, a conta já nasce confirmada e logada.
    if (signUpData.session) return;
    setSentTo(email.trim().toLowerCase());
  };

  if (sentTo) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.scroll}>
          <Text style={styles.title}>Confirme seu e-mail</Text>
          <Text style={[styles.subtitle, { marginBottom: Spacing.lg }]}>
            Enviamos um link para {sentTo}. Toque nele e depois entre no app com seu e-mail e senha.
          </Text>
          <Link href="/(auth)/login" style={styles.link}>
            Ir para o login
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Criar conta</Text>
          <Text style={[styles.subtitle, { marginBottom: Spacing.xl }]}>Preencha seus dados para acessar o app e solicitar sua locação.</Text>

          <View style={{ gap: Spacing.md }}>
            <Input label="Nome completo" placeholder="Seu nome completo" autoCapitalize="words" value={name} onChangeText={setName} />
            <Input label="CPF" placeholder="000.000.000-00" keyboardType="number-pad" value={cpf} onChangeText={(t) => setCpf(maskCPF(t))} />
            <Input label="WhatsApp / Telefone" placeholder="(00) 00000-0000" keyboardType="phone-pad" value={phone} onChangeText={(t) => setPhone(maskPhone(t))} />
            <Input label="E-mail" placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" value={email} onChangeText={setEmail} />
            <Input label="Crie uma senha" placeholder="Pelo menos 8 caracteres" secureTextEntry autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} />
            {error && (
              <Text style={{ color: Colors.danger, fontSize: 14 }} accessibilityRole="alert">
                {error}
              </Text>
            )}
            <Button label="Criar conta" size="lg" loading={loading} onPress={register} />
          </View>

          <View style={{ marginTop: Spacing.xl, alignItems: "center" }}>
            <Link href="/(auth)/login" style={styles.link}>
              Já tenho conta
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
  title: { fontSize: 26, fontWeight: "700", color: Colors.text },
  subtitle: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, marginTop: 4 },
  link: { color: Colors.brandSoft, fontWeight: "700", fontSize: 14 },
});
