import { Platform } from "react-native";

/**
 * Tokens visuais do App do Locatário (LOCAKAR). Única fonte de cor, espaço, raio, tipo e sombra:
 * telas e componentes não usam cor literal. Dark em camadas: background → surface → elevated.
 */
export const Colors = {
  background: "#050505",
  surface: "#0D0D0F",
  surfaceElevated: "#121216",
  surfaceHover: "#17171C",
  card: "#0F0F12",
  border: "rgba(255, 255, 255, 0.07)",
  borderStrong: "rgba(255, 255, 255, 0.14)",

  // Marca: roxo é assinatura, não decoração
  brand: "#8B008B",
  brandDeep: "#600060",
  magenta: "#A000A0",
  brandSoft: "#D98ED9",
  brandTint: "rgba(160, 0, 160, 0.12)",
  brandBorder: "rgba(208, 111, 208, 0.28)",
  brandGlow: "rgba(160, 0, 160, 0.35)",

  // Texto
  text: "#FFFFFF",
  textSecondary: "#D4D4D8",
  textMuted: "#A1A1AA",
  textSubtle: "#71717A",

  // Semânticos (só para estado)
  success: "#34D399",
  successSoft: "rgba(52, 211, 153, 0.10)",
  warning: "#FBBF24",
  warningSoft: "rgba(251, 191, 36, 0.10)",
  danger: "#F87171",
  dangerSoft: "rgba(248, 113, 113, 0.10)",
  info: "#60A5FA",
  infoSoft: "rgba(96, 165, 250, 0.10)",

  overlay: "rgba(0, 0, 0, 0.78)",
  skeleton: "rgba(255, 255, 255, 0.06)",
};

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  // intermediários da escala 4/8
  s12: 12,
  s20: 20,
  s40: 40,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

/** Escala tipográfica: poucos pesos, números financeiros com destaque. */
export const Type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: -0.4 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700" as const, letterSpacing: -0.2 },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
  small: { fontSize: 13, lineHeight: 19, fontWeight: "400" as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const, letterSpacing: 0.8, textTransform: "uppercase" as const },
  money: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.3, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
};

/** Elevação discreta (web usa boxShadow; nativo usa elevation/shadow*). */
export const Shadow = {
  card: Platform.select({
    web: { boxShadow: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)" },
    default: { shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  }) as object,
};

/** Breakpoints (largura da janela, dp). */
export const Breakpoints = { tablet: 768, desktop: 1024, wide: 1440 };

/** Altura útil da barra inferior (sem a safe area). */
export const TAB_BAR_HEIGHT = 64;
/** Largura da barra lateral no desktop. */
export const SIDEBAR_WIDTH = 248;

export const Motion = { fast: 150, base: 200 };
