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

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      return Alert.alert("Atenção", "Preencha e-mail e senha.");
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      return Alert.alert("Erro ao entrar", "E-mail ou senha incorretos.");
    }

    router.replace("/(tabs)/inicio");
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
            <Text style={styles.tagline}>ÁREA DO LOCATÁRIO</Text>
            <Text style={styles.title}>Bem-vindo de volta</Text>
            <Text style={styles.subtitle}>
              Acesse sua conta para gerenciar seu veículo, pagamentos e contrato.
            </Text>
          </View>

          <View style={styles.form}>
            <Input
              label="E-mail cadastrado"
              placeholder="seu@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />

            <Input
              label="Senha"
              placeholder="Sua senha secreta"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Button
              label="Entrar no aplicativo"
              size="lg"
              loading={loading}
              onPress={handleLogin}
              style={styles.btnSubmit}
            />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Ainda não tem acesso?</Text>
            <Link href="/(auth)/cadastro" asChild>
              <Text style={styles.footerLink}>Cadastre-se com seu CPF</Text>
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
  },
  brandAccent: {
    color: Colors.brandSoft,
  },
  tagline: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.brandSoft,
    letterSpacing: 1.5,
    marginTop: 2,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 26,
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
