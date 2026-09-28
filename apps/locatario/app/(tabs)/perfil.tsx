import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  User,
  Shield,
  FileText,
  HelpCircle,
  LogOut,
  ChevronRight,
  CreditCard,
  Phone,
  Mail,
} from "lucide-react-native";
import { useLocatario } from "../../hooks/useLocatario";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Colors, Spacing, Radius } from "../../constants/theme";

export default function PerfilScreen() {
  const router = useRouter();
  const { client, signOut } = useLocatario();

  const handleLogout = () => {
    Alert.alert("Sair da conta", "Deseja realmente desconectar deste dispositivo?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Cabeçalho do Perfil */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {client?.name ? client.name.charAt(0).toUpperCase() : "L"}
            </Text>
          </View>
          <Text style={styles.userName}>{client?.name || "Locatário"}</Text>
          <Text style={styles.userCpf}>CPF: {client?.cpf || "—"}</Text>
        </View>

        {/* Informações Cadastrais */}
        <Card style={styles.card}>
          <Text style={styles.cardHeader}>Dados Cadastrais</Text>
          <View style={styles.row}>
            <Phone color={Colors.textMuted} size={16} />
            <Text style={styles.rowLabel}>Telefone:</Text>
            <Text style={styles.rowValue}>{client?.phone || "—"}</Text>
          </View>
          <View style={styles.row}>
            <Mail color={Colors.textMuted} size={16} />
            <Text style={styles.rowLabel}>E-mail:</Text>
            <Text style={styles.rowValue}>{client?.email || "—"}</Text>
          </View>
          <View style={styles.row}>
            <CreditCard color={Colors.textMuted} size={16} />
            <Text style={styles.rowLabel}>Validade da CNH:</Text>
            <Text style={styles.rowValue}>
              {client?.cnhExpiry ? new Date(client.cnhExpiry).toLocaleDateString("pt-BR") : "—"}
            </Text>
          </View>
        </Card>

        {/* Menu de Ações e Suporte */}
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => Linking.openURL("https://wa.me/5519989615873")}
          >
            <HelpCircle color={Colors.brandSoft} size={20} />
            <Text style={styles.menuLabel}>Falar com Suporte (WhatsApp)</Text>
            <ChevronRight color={Colors.textSubtle} size={18} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => Alert.alert("Privacidade", "A LOCAKAR trata seus dados sob a LGPD (Lei 13.709/2018). Seus registros biométricos e fotos são guardados com criptografia estrita para fins contratuais.")}
          >
            <Shield color={Colors.brandSoft} size={20} />
            <Text style={styles.menuLabel}>Privacidade e LGPD</Text>
            <ChevronRight color={Colors.textSubtle} size={18} />
          </TouchableOpacity>
        </Card>

        {/* Botão Sair */}
        <Button
          label="Sair da Conta"
          variant="outline"
          icon={<LogOut color={Colors.danger} size={18} />}
          onPress={handleLogout}
          style={styles.logoutBtn}
        />

        <Text style={styles.version}>LOCAKAR App v1.0.0 · Todos os direitos reservados</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.md, gap: Spacing.md },
  profileHeader: { alignItems: "center", paddingVertical: Spacing.lg },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surface,
    borderColor: Colors.brandGlow,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  avatarText: { fontSize: 28, fontWeight: "900", color: Colors.brandSoft },
  userName: { fontSize: 20, fontWeight: "700", color: Colors.text },
  userCpf: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  card: { padding: Spacing.md, gap: Spacing.md },
  cardHeader: { fontSize: 13, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  rowLabel: { color: Colors.textMuted, fontSize: 13 },
  rowValue: { color: Colors.text, fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: Spacing.md, paddingVertical: 4 },
  menuLabel: { color: Colors.text, fontSize: 14, fontWeight: "600", flex: 1 },
  divider: { height: 1, backgroundColor: Colors.border },
  logoutBtn: { marginTop: Spacing.sm, borderColor: Colors.dangerSoft },
  version: { textAlign: "center", color: Colors.textSubtle, fontSize: 11, marginTop: Spacing.md },
});
