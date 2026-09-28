import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Colors, Spacing } from "../../constants/theme";
import { supabase } from "../../services/supabase";

// Máscara e validação puras de CPF
function maskCPF(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function isValidCPF(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(d[10]);
}

export default function CadastroScreen() {
  const router = useRouter();
  const [cpf, setCpf] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password || !cpf) {
      return Alert.alert("Atenção", "Preencha todos os campos.");
    }

    if (!isValidCPF(cpf)) {
      return Alert.alert("CPF inválido", "Informe um CPF válido para localizar seu cadastro.");
    }

    if (password.length < 6) {
      return Alert.alert("Senha curta", "A senha deve ter no mínimo 6 caracteres.");
    }

    setLoading(true);
    // Cadastra o usuário com o CPF nos metadados para que o trigger vincule ao cliente
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          cpf: cpf.replace(/\D/g, ""),
          name: name.trim(),
        },
      },
    });
    setLoading(false);

    if (error) {
      return Alert.alert("Erro no cadastro", error.message);
    }

    Alert.alert(
      "Conta criada!",
      "Seu cadastro foi vinculado à sua ficha na LOCAKAR.",
      [{ text: "Continuar", onPress: () => router.replace("/(tabs)/inicio") }]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.header}>
            <Text style={styles.brandTitle}>
              LOCA<Text style={styles.brandAccent}>KAR</Text>
            </Text>
            <Text style={styles.title}>Criar sua conta</Text>
            <Text style={styles.subtitle}>
              Informe seu CPF para vincularmos ao seu contrato de locação ativo.
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Seu CPF"
              placeholder="000.000.000-00"
              keyboardType="numeric"
              value={cpf}
              onChangeText={(text) => setCpf(maskCPF(text))}
            />

            <Input
              label="Nome completo"
              placeholder="Como no seu documento"
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />

            <Input
              label="E-mail"
              placeholder="seu@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />

            <Input
              label="Crie uma senha"
              placeholder="Mínimo 6 dígitos"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Button
              label="Criar conta e acessar"
              size="lg"
              loading={loading}
              onPress={handleRegister}
              style={styles.btnSubmit}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Já tem uma conta?</Text>
            <Link href="/(auth)/login" asChild>
              <Text style={styles.footerLink}>Fazer login</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    padding: Spacing.xl,
    justifyContent: "center",
  },
  header: {
    marginBottom: Spacing.xl,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: Colors.text,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  brandAccent: {
    color: Colors.brandSoft,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  form: {
    gap: Spacing.md,
  },
  btnSubmit: {
    marginTop: Spacing.sm,
  },
  footer: {
    marginTop: Spacing.xxl,
    alignItems: "center",
    gap: Spacing.xs,
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  footerLink: {
    color: Colors.brandSoft,
    fontWeight: "700",
    fontSize: 14,
  },
});
