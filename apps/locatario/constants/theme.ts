import { Platform } from "react-native";

export type ThemeName = "dark" | "light";
export type ThemeMode = "dark" | "light" | "system";

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceHover: string;
  surfaceSecondary: string;
  card: string;
  border: string;
  borderStrong: string;

  // Marca (identidade nos dois temas)
  brand: string;
  brandDeep: string;
  magenta: string;
  brandSoft: string;
  brandTint: string;
  brandBorder: string;
  brandGlow: string;

  // Texto
  text: string;
  textSecondary: string;
  textMuted: string;
  textSubtle: string;
  textDisabled: string;

  // Semânticos
  success: string;
  successSoft: string;
  successBorder: string;
  warning: string;
  warningSoft: string;
  warningBorder: string;
  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  info: string;
  infoSoft: string;
  infoBorder: string;

  // Controles e overlays
  overlay: string;
  skeleton: string;
  inputBg: string;
  inputBorder: string;
  inputBorderFocus: string;
  tabBarBg: string;
  tabBarBorder: string;
  tabBarActiveBg: string;
}

export const DarkPalette: ThemeColors = {
  background: "#050505",
  surface: "#0D0D0F",
  surfaceElevated: "#121216",
  surfaceHover: "#17171C",
  surfaceSecondary: "#18181B",
  card: "#0F0F12",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.16)",

  brand: "#8B008B",
  brandDeep: "#600060",
  magenta: "#A000A0",
  brandSoft: "#D98ED9",
  brandTint: "rgba(160, 0, 160, 0.14)",
  brandBorder: "rgba(208, 111, 208, 0.32)",
  brandGlow: "rgba(160, 0, 160, 0.35)",

  text: "#FFFFFF",
  textSecondary: "#D4D4D8",
  textMuted: "#A1A1AA",
  textSubtle: "#71717A",
  textDisabled: "#52525B",

  success: "#34D399",
  successSoft: "rgba(52, 211, 153, 0.12)",
  successBorder: "rgba(52, 211, 153, 0.28)",
  warning: "#FBBF24",
  warningSoft: "rgba(251, 191, 36, 0.12)",
  warningBorder: "rgba(251, 191, 36, 0.28)",
  danger: "#F87171",
  dangerSoft: "rgba(248, 113, 113, 0.12)",
  dangerBorder: "rgba(248, 113, 113, 0.28)",
  info: "#60A5FA",
  infoSoft: "rgba(96, 165, 250, 0.12)",
  infoBorder: "rgba(96, 165, 250, 0.28)",

  overlay: "rgba(0, 0, 0, 0.82)",
  skeleton: "rgba(255, 255, 255, 0.06)",
  inputBg: "#0D0D0F",
  inputBorder: "rgba(255, 255, 255, 0.12)",
  inputBorderFocus: "#D98ED9",
  tabBarBg: "#0D0D0F",
  tabBarBorder: "rgba(255, 255, 255, 0.08)",
  tabBarActiveBg: "rgba(160, 0, 160, 0.14)",
};

export const LightPalette: ThemeColors = {
  background: "#F7F7F8",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceHover: "#F1F1F4",
  surfaceSecondary: "#EAEAEF",
  card: "#FFFFFF",
  border: "#E4E4E7",
  borderStrong: "#D4D4D8",

  brand: "#8B008B",
  brandDeep: "#600060",
  magenta: "#A000A0",
  brandSoft: "#8B008B",
  brandTint: "rgba(139, 0, 139, 0.08)",
  brandBorder: "rgba(139, 0, 139, 0.25)",
  brandGlow: "rgba(139, 0, 139, 0.20)",

  text: "#0F172A",
  textSecondary: "#334155",
  textMuted: "#64748B",
  textSubtle: "#94A3B8",
  textDisabled: "#CBD5E1",

  success: "#059669",
  successSoft: "rgba(5, 150, 105, 0.10)",
  successBorder: "rgba(5, 150, 105, 0.25)",
  warning: "#D97706",
  warningSoft: "rgba(217, 119, 6, 0.10)",
  warningBorder: "rgba(217, 119, 6, 0.25)",
  danger: "#DC2626",
  dangerSoft: "rgba(220, 38, 38, 0.10)",
  dangerBorder: "rgba(220, 38, 38, 0.25)",
  info: "#2563EB",
  infoSoft: "rgba(37, 99, 235, 0.10)",
  infoBorder: "rgba(37, 99, 235, 0.25)",

  overlay: "rgba(15, 23, 42, 0.65)",
  skeleton: "rgba(0, 0, 0, 0.06)",
  inputBg: "#FFFFFF",
  inputBorder: "#E4E4E7",
  inputBorderFocus: "#8B008B",
  tabBarBg: "#FFFFFF",
  tabBarBorder: "#E4E4E7",
  tabBarActiveBg: "rgba(139, 0, 139, 0.08)",
};

/** Variável mutável em tempo de execução sincronizada pelo ThemeProvider para consumo imediato. */
let activeTheme: ThemeName = "dark";
export const getActiveTheme = (): ThemeName => activeTheme;
export const setActiveTheme = (name: ThemeName) => {
  activeTheme = name;
};

export const getThemeColors = (theme: ThemeName = activeTheme): ThemeColors =>
  theme === "light" ? LightPalette : DarkPalette;

/** Proxy retrocompatível: `Colors.background` retorna dinamicamente a cor do tema ativo. */
export const Colors: ThemeColors = new Proxy(DarkPalette, {
  get(_target, prop: keyof ThemeColors) {
    const palette = activeTheme === "light" ? LightPalette : DarkPalette;
    return palette[prop];
  },
});

export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
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

export const Type = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: -0.4 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700" as const, letterSpacing: -0.2 },
  heading: { fontSize: 16, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
  small: { fontSize: 13, lineHeight: 19, fontWeight: "400" as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const, letterSpacing: 0.8, textTransform: "uppercase" as const },
  money: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.3, fontVariant: ["tabular-nums"] as ["tabular-nums"] },
};

export const getShadow = (theme: ThemeName = activeTheme) => {
  const isLight = theme === "light";
  return Platform.select({
    web: {
      boxShadow: isLight
        ? "0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)"
        : "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.25)",
    },
    default: {
      shadowColor: isLight ? "#000" : "#000",
      shadowOpacity: isLight ? 0.08 : 0.3,
      shadowRadius: isLight ? 8 : 12,
      shadowOffset: { width: 0, height: isLight ? 2 : 4 },
      elevation: isLight ? 2 : 3,
    },
  }) as object;
};

export const Shadow = {
  get card() {
    return getShadow(activeTheme);
  },
};

export const Breakpoints = { tablet: 768, desktop: 1024, wide: 1440 };
export const TAB_BAR_HEIGHT = 64;
export const SIDEBAR_WIDTH = 248;
export const Motion = { fast: 150, base: 200 };
