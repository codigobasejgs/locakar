import { Camera, Image as ImageIcon, X } from "lucide-react-native";
import { useState } from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Radius, Spacing, type ThemeColors } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { useThemedStyles } from "../../hooks/useThemedStyles";
import { PermissionDenied, pickImage } from "../../services/upload";

/**
 * Quadro de foto: câmera ou galeria (no navegador, só arquivo). Mostra a prévia e permite trocar/remover.
 * `camera` false = só galeria (documentos já digitalizados).
 */
export function PhotoPicker({
  label,
  hint,
  uri,
  onChange,
  onError,
}: {
  label: string;
  hint?: string;
  uri: string | null;
  onChange: (uri: string | null) => void;
  onError: (message: string) => void;
}) {
  const { colors: Colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const pick = async (source: "camera" | "gallery") => {
    setBusy(true);
    try {
      const picked = await pickImage(source);
      if (picked) onChange(picked);
    } catch (e) {
      onError(e instanceof PermissionDenied ? e.message : "Não foi possível abrir a câmera/galeria.");
    }
    setBusy(false);
  };

  return (
    <View style={styles.box}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{label}</Text>
          {hint && <Text style={styles.hint}>{hint}</Text>}
        </View>
        {uri && (
          <TouchableOpacity onPress={() => onChange(null)} accessibilityRole="button" accessibilityLabel={`Remover foto: ${label}`} hitSlop={12}>
            <X color={Colors.textMuted} size={20} />
          </TouchableOpacity>
        )}
      </View>
      {uri ? (
        <Image source={{ uri }} style={styles.preview} accessibilityLabel={`Foto: ${label}`} />
      ) : (
        <View style={styles.actions}>
          {Platform.OS !== "web" && (
            <TouchableOpacity style={styles.action} disabled={busy} onPress={() => pick("camera")} accessibilityRole="button" accessibilityLabel={`Tirar foto: ${label}`}>
              <Camera color={Colors.brandSoft} size={22} />
              <Text style={styles.actionText}>Tirar foto</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.action} disabled={busy} onPress={() => pick("gallery")} accessibilityRole="button" accessibilityLabel={`Escolher da galeria: ${label}`}>
            <ImageIcon color={Colors.brandSoft} size={22} />
            <Text style={styles.actionText}>{Platform.OS === "web" ? "Escolher arquivo" : "Galeria"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
  box: { backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.sm },
  header: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start" },
  label: { color: Colors.text, fontSize: 15, fontWeight: "600" },
  hint: { color: Colors.textMuted, fontSize: 12, marginTop: 2, lineHeight: 17 },
  preview: { width: "100%", aspectRatio: 4 / 3, borderRadius: Radius.md, backgroundColor: Colors.surface },
  actions: { flexDirection: "row", gap: Spacing.sm },
  action: { flex: 1, alignItems: "center", gap: 6, paddingVertical: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderStrong, borderStyle: "dashed" },
  actionText: { color: Colors.text, fontSize: 13, fontWeight: "600" },
});
