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

/* ---------- White label: cores da locadora sobre a paleta base ---------- */
const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (h: string, t: number) => {
  const target = t > 0 ? 255 : 0, k = Math.abs(t);
  return "#" + rgb(h).map((c) => Math.round(c + (target - c) * k).toString(16).padStart(2, "0")).join("");
};
const alpha = (h: string, a: number) => { const [r, g, b] = rgb(h); return `rgba(${r}, ${g}, ${b}, ${a})`; };
/** Tom do destaque com contraste 4.5:1 sobre o fundo (mesma regra de src/lib/contrast.ts). */
const readable = (fg: string, bg: string) => {
  if (ratio(fg, bg) >= 4.5) return fg;
  const lighten = lum(bg) < 0.5;
  for (let t = 0.05; t <= 1; t += 0.05) { const c = mix(fg, lighten ? t : -t); if (ratio(c, bg) >= 4.5) return c; }
  return lighten ? "#ffffff" : "#000000";
};

export interface BrandColors { primary?: string | null; secondary?: string | null; accent?: string | null }

/** Paleta da locadora: cores inválidas são ignoradas (fica a paleta padrão). */
export function brandedPalette(base: ThemeColors, theme: ThemeName, b?: BrandColors | null): ThemeColors {
  if (!b?.primary || !HEX.test(b.primary)) return base;
  const primary = b.primary;
  const deep = b.secondary && HEX.test(b.secondary) ? b.secondary : mix(primary, -0.3);
  const accent = b.accent && HEX.test(b.accent) ? b.accent : mix(primary, 0.15);
  const soft = readable(theme === "dark" ? mix(accent, 0.35) : accent, base.surface);
  return {
    ...base,
    brand: primary,
    brandDeep: deep,
    magenta: accent,
    brandSoft: soft,
    brandTint: alpha(accent, theme === "dark" ? 0.14 : 0.08),
    brandBorder: alpha(soft, theme === "dark" ? 0.32 : 0.25),
    brandGlow: alpha(accent, theme === "dark" ? 0.35 : 0.2),
    inputBorderFocus: soft,
    tabBarActiveBg: alpha(accent, theme === "dark" ? 0.14 : 0.08),
  };
}

/** Texto legível sobre a cor principal (botões). */
export const onBrand = (hex: string) => (HEX.test(hex) && ratio(hex, "#ffffff") < ratio(hex, "#0f172a") ? "#0f172a" : "#ffffff");

let activeBrand: BrandColors | null = null;
export const setActiveBrand = (b: BrandColors | null) => {
  activeBrand = b;
};

/** Variável mutável em tempo de execução sincronizada pelo ThemeProvider para consumo imediato. */
let activeTheme: ThemeName = "dark";
export const getActiveTheme = (): ThemeName => activeTheme;
export const setActiveTheme = (name: ThemeName) => {
  activeTheme = name;
};

export const getThemeColors = (theme: ThemeName = activeTheme): ThemeColors =>
  brandedPalette(theme === "light" ? LightPalette : DarkPalette, theme, activeBrand);

/** Proxy retrocompatível: `Colors.background` retorna dinamicamente a cor do tema ativo. */
export const Colors: ThemeColors = new Proxy(DarkPalette, {
  get(_target, prop: keyof ThemeColors) {
    return getThemeColors()[prop];
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
