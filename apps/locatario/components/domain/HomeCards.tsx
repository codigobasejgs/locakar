import { ChevronRight, type LucideIcon } from "lucide-react-native";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Radius, Spacing, Type, getShadow } from "../../constants/theme";
import { useTheme } from "../../context/ThemeProvider";
import { Badge, type BadgeTone } from "../ui/Badge";

/** "29/09/2026" → "29 SET" (datas do servidor "AAAA-MM-DD", sem fuso). */
const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
export const shortDate = (iso?: string | null) => {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? ""}`;
};

/** Sufixo do plano em texto corrido (vai numa linha própria, nunca colado ao valor). */
export const PLAN_UNIT: Record<string, string> = {
  daily: "por dia",
  weekly: "por semana",
  biweekly: "por quinzena",
  monthly: "por mês",
  quarterly: "por trimestre",
  semiannual: "por semestre",
  annual: "por ano",
};

/** Card principal da locação/solicitação: carro, status, período e valor com hierarquia clara. */
export function RentalStatusCard({
  title,
  subtitle,
  image,
  status,
  period,
  amountLabel,
  amount,
  amountUnit,
  amountTone,
  children,
}: {
  title: string;
  subtitle?: string;
  image?: string | null;
  status?: { label: string; tone: BadgeTone };
  period?: { from?: string | null; to?: string | null };
  amountLabel?: string;
  amount?: string;
  amountUnit?: string;
  amountTone?: "danger";
  children?: React.ReactNode;
}) {
  const { colors, theme } = useTheme();
  const shadow = getShadow(theme);

  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.brandBorder,
        },
        shadow,
      ]}
    >
      <View style={styles.heroTop}>
        <View style={styles.heroTitle}>
          <Text style={[styles.carName, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={[styles.carSub, { color: colors.textMuted }]}>{subtitle}</Text> : null}
        </View>
        {image ? <Image source={{ uri: image }} style={styles.carImage} resizeMode="contain" accessibilityLabel={title} /> : null}
      </View>
      {status && <Badge label={status.label} tone={status.tone} />}

      {(period || amount) && (
        <View style={[styles.facts, { borderTopColor: colors.border }]}>
          {period && (
            <View style={styles.fact}>
              <Text style={[styles.factLabel, { color: colors.textSubtle }]}>Período</Text>
              <Text style={[styles.factValue, { color: colors.text }]}>
                {shortDate(period.from)} <Text style={{ color: colors.brandSoft }}>→</Text> {shortDate(period.to)}
              </Text>
            </View>
          )}
          {amount && (
            <View style={styles.fact}>
              <Text style={[styles.factLabel, { color: colors.textSubtle }]}>{amountLabel ?? "Plano"}</Text>
              <Text style={[styles.money, { color: amountTone === "danger" ? colors.danger : colors.text }]}>{amount}</Text>
              {amountUnit ? <Text style={[styles.unit, { color: colors.textMuted }]}>{amountUnit}</Text> : null}
            </View>
          )}
        </View>
      )}
      {children}
    </View>
  );
}

/** Bloco "Status da solicitação": rótulo discreto + texto com medida de leitura confortável. */
export function StatusNote({ title, text, tone }: { title: string; text: string; tone?: "warning" | "danger" }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.note, { borderTopColor: colors.border }]}>
      <Text style={[styles.noteTitle, { color: colors.textSubtle }]}>{title}</Text>
      <Text
        style={[
          styles.noteText,
          {
            color: tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.textSecondary,
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

/** Atalho compacto: ícone, título, detalhe real opcional e indicação de ação. */
export function QuickAction({
  icon: Icon,
  label,
  detail,
  onPress,
  tone,
  compact,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  onPress: () => void;
  tone?: "danger" | "warning";
  compact?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        styles.action,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
        compact && styles.actionCompact,
        hovered && { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong, transform: [{ translateY: -1 }] },
        focused && { borderColor: colors.brandSoft },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
      ]}
    >
      <View style={[styles.actionIcon, { backgroundColor: colors.brandTint }]}>
        <Icon color={tone === "danger" ? colors.danger : tone === "warning" ? colors.warning : colors.brandSoft} size={20} strokeWidth={1.8} />
      </View>
      <View style={compact ? { alignSelf: "stretch" } : { flex: 1, minWidth: 0 }}>
        <Text style={[styles.actionLabel, { color: colors.text }]} numberOfLines={compact ? 2 : 1}>
          {label}
        </Text>
        {detail ? (
          <Text style={[styles.actionDetail, { color: colors.textMuted }]} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {!compact && <ChevronRight color={colors.textSubtle} size={16} />}
    </Pressable>
  );
}

/** Linha de informação (rótulo discreto em cima, valor embaixo). */
export function InfoTile({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.tile}>
      <Text style={[styles.factLabel, { color: colors.textSubtle }]}>{label}</Text>
      <Text style={[styles.tileValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  heroTitle: { flex: 1, minWidth: 0, gap: 2 },
  carName: { ...Type.title },
  carSub: { ...Type.small },
  carImage: { width: 112, height: 64, maxWidth: "40%" },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: Spacing.md, columnGap: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1 },
  fact: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 4 },
  factLabel: { ...Type.label },
  factValue: { ...Type.heading },
  money: { ...Type.money },
  unit: { ...Type.small, marginTop: -2 },
  note: { gap: 6, paddingTop: Spacing.md, borderTopWidth: 1 },
  noteTitle: { ...Type.label },
  noteText: { ...Type.body, maxWidth: 560 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s12,
    minHeight: 64,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.s12,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  actionCompact: { flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", gap: Spacing.s12, minHeight: 96, padding: Spacing.md },
  actionIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 14, lineHeight: 19, fontWeight: "600" },
  actionDetail: { fontSize: 12, lineHeight: 16, marginTop: 1 },
  tile: { flexGrow: 1, flexBasis: 120, minWidth: 0, gap: 4 },
  tileValue: { ...Type.heading },
});
