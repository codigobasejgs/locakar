import { Download } from "lucide-react-native";
import { useState } from "react";
import { Text } from "react-native";
import { Spacing } from "../../constants/theme";
import { useBrandName } from "../../context/OrgProvider";
import { useTheme } from "../../context/ThemeProvider";
import { useInstallApp } from "../../hooks/useInstallApp";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

/** "Instalar o app da locadora" na versão web: prompt do navegador ou passo a passo do iPhone. Some quando já instalado. */
export function InstallAppCard() {
  const { mode, install } = useInstallApp();
  const name = useBrandName();
  const { colors } = useTheme();
  const [help, setHelp] = useState(false);
  if (!mode) return null;
  return (
    <Card style={{ gap: Spacing.sm }}>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Instale o app da {name}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
        Abra direto da tela de início, em tela cheia, com o ícone da {name}. Não ocupa espaço como um app de loja.
      </Text>
      {mode === "ios" && help ? (
        <Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }} accessibilityRole="text">
          {"1. No Safari, toque em Compartilhar (quadrado com seta).\n2. Toque em “Adicionar à Tela de Início”.\n3. Confirme em “Adicionar”."}
        </Text>
      ) : (
        <Button
          label={mode === "ios" ? "Como instalar no iPhone" : "Instalar app"}
          icon={<Download color="#FFFFFF" size={18} />}
          onPress={() => (mode === "ios" ? setHelp(true) : install())}
        />
      )}
    </Card>
  );
}
