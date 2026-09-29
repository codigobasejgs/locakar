import { ChevronRight, type LucideIcon } from "lucide-react-native";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Radius, Shadow, Spacing, Type } from "../../constants/theme";
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
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.heroTitle}>
          <Text style={styles.carName} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.carSub}>{subtitle}</Text> : null}
        </View>
        {image ? <Image source={{ uri: image }} style={styles.carImage} resizeMode="contain" accessibilityLabel={title} /> : null}
      </View>
      {status && <Badge label={status.label} tone={status.tone} />}

      {(period || amount) && (
        <View style={styles.facts}>
          {period && (
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Período</Text>
              <Text style={styles.factValue}>
                {shortDate(period.from)} <Text style={styles.arrow}>→</Text> {shortDate(period.to)}
              </Text>
            </View>
          )}
          {amount && (
            <View style={styles.fact}>
              <Text style={styles.factLabel}>{amountLabel ?? "Plano"}</Text>
              <Text style={[styles.money, amountTone === "danger" && { color: Colors.danger }]}>{amount}</Text>
              {amountUnit ? <Text style={styles.unit}>{amountUnit}</Text> : null}
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
  return (
    <View style={styles.note}>
      <Text style={styles.noteTitle}>{title}</Text>
      <Text style={[styles.noteText, tone === "warning" && { color: Colors.warning }, tone === "danger" && { color: Colors.danger }]}>{text}</Text>
    </View>
  );
}

/** Atalho compacto: ícone, título, detalhe real opcional e indicação de ação. */
/** `compact`: ícone em cima e rótulo embaixo (grade de 2 colunas no celular, sem truncar). */
export function QuickAction({ icon: Icon, label, detail, onPress, tone, compact }: { icon: LucideIcon; label: string; detail?: string; onPress: () => void; tone?: "danger" | "warning"; compact?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        styles.action,
        compact && styles.actionCompact,
        hovered && styles.actionHover,
        focused && { borderColor: Colors.brandSoft },
        pressed && styles.actionPressed,
      ]}
    >
      <View style={styles.actionIcon}>
        <Icon color={tone === "danger" ? Colors.danger : tone === "warning" ? Colors.warning : Colors.brandSoft} size={20} strokeWidth={1.8} />
      </View>
      <View style={compact ? { alignSelf: "stretch" } : { flex: 1, minWidth: 0 }}>
        <Text style={styles.actionLabel} numberOfLines={compact ? 2 : 1}>
          {label}
        </Text>
        {detail ? (
          <Text style={styles.actionDetail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {!compact && <ChevronRight color={Colors.textSubtle} size={16} />}
    </Pressable>
  );
}

/** Linha de informação (rótulo discreto em cima, valor embaixo). */
export function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.brandBorder,
    backgroundColor: Colors.surfaceElevated,
    ...Shadow.card,
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  heroTitle: { flex: 1, minWidth: 0, gap: 2 },
  carName: { ...Type.title, color: Colors.text },
  carSub: { ...Type.small, color: Colors.textMuted },
  carImage: { width: 112, height: 64, maxWidth: "40%" },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: Spacing.md, columnGap: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  fact: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 4 },
  factLabel: { ...Type.label, color: Colors.textSubtle },
  factValue: { ...Type.heading, color: Colors.text },
  arrow: { color: Colors.brandSoft },
  money: { ...Type.money, color: Colors.text },
  unit: { ...Type.small, color: Colors.textMuted, marginTop: -2 },
  note: { gap: 6, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  noteTitle: { ...Type.label, color: Colors.textSubtle },
  noteText: { ...Type.body, color: Colors.textSecondary, maxWidth: 560 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s12,
    minHeight: 64,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.s12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  actionCompact: { flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", gap: Spacing.s12, minHeight: 96, padding: Spacing.md },
  actionHover: { backgroundColor: Colors.surfaceHover, borderColor: Colors.borderStrong, transform: [{ translateY: -1 }] },
  actionPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  actionIcon: { width: 36, height: 36, borderRadius: Radius.md, alignItems: "center", justifyContent: "center", backgroundColor: Colors.brandTint },
  actionLabel: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: Colors.text },
  actionDetail: { fontSize: 12, lineHeight: 16, color: Colors.textMuted, marginTop: 1 },
  tile: { flexGrow: 1, flexBasis: 120, minWidth: 0, gap: 4 },
  tileValue: { ...Type.heading, color: Colors.text },
});
