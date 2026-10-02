/** Contraste WCAG 2.x para as cores escolhidas no white label. */

const HEX = /^#([0-9a-f]{6})$/i;

export const isHex = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Texto (branco ou quase-preto) com melhor contraste sobre `bg`. */
export function onColor(bg: string) {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#0f172a") ? "#ffffff" : "#0f172a";
}

/** Mistura `hex` com branco (t>0) ou preto (t<0), t em [-1, 1]. */
export function shade(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const mix = (c: number) => Math.round(c + (target - c) * k);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Ajusta `fg` até atingir `min` de contraste sobre `bg` (clareando ou escurecendo).
 * Usado para a cor de destaque usada como texto/ícone sobre os fundos claro e escuro.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5) {
  if (contrastRatio(fg, bg) >= min) return fg;
  const lighten = luminance(bg) < 0.5;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = shade(fg, lighten ? t : -t);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return lighten ? "#ffffff" : "#000000";
}

/** Fundos do painel (globals.css) usados para validar legibilidade. */
export const SURFACES = { dark: "#0d0d0f", light: "#ffffff" } as const;

/**
 * Tokens CSS do painel a partir da marca. Garante legibilidade: texto sobre a cor principal escolhido
 * automaticamente e tom "soft" (texto/ícones de destaque) ajustado para 4.5:1 em cada tema.
 */
export function brandTokens(b: { primary?: string; secondary?: string; accent?: string } | undefined, theme: "dark" | "light") {
  if (!b || !isHex(b.primary)) return null;
  const primary = b.primary;
  const secondary = isHex(b.secondary) ? b.secondary : shade(primary, -0.3);
  const accent = isHex(b.accent) ? b.accent : shade(primary, 0.15);
  return {
    "--theme-brand": primary,
    "--theme-brand-deep": secondary,
    "--theme-magenta": accent,
    "--theme-brand-soft": ensureContrast(theme === "dark" ? shade(accent, 0.35) : accent, SURFACES[theme]),
    "--theme-on-brand": onColor(primary),
  } as Record<string, string>;
}

/** Avisos de legibilidade para a tela de Aparência. */
export function brandWarnings(b: { primary?: string; secondary?: string; accent?: string }) {
  const out: string[] = [];
  if (isHex(b.primary)) {
    const on = onColor(b.primary);
    if (contrastRatio(b.primary, on) < 4.5) out.push(`A cor principal tem pouco contraste com o texto dos botões (${contrastRatio(b.primary, on).toFixed(1)}:1). O texto foi ajustado para ${on === "#ffffff" ? "branco" : "escuro"}, mas prefira uma cor mais forte.`);
    if (contrastRatio(b.primary, SURFACES.dark) < 1.6) out.push("A cor principal quase some no tema escuro.");
    if (contrastRatio(b.primary, SURFACES.light) < 1.6) out.push("A cor principal quase some no tema claro.");
  }
  return out;
}
