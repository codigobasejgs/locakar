import { useWindowDimensions } from "react-native";
import { Breakpoints, Spacing } from "../constants/theme";

/**
 * Faixas de layout: mobile (< 768), tablet (768–1023) e desktop (≥ 1024, com barra lateral).
 * Gutter e largura máxima do conteúdo acompanham a faixa.
 */
export function useLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= Breakpoints.desktop;
  const isTablet = !isDesktop && width >= Breakpoints.tablet;
  const gutter = isDesktop ? Spacing.xl : isTablet ? Spacing.lg : width < 360 ? Spacing.s12 : Spacing.md;
  const contentMax = isDesktop ? (width >= Breakpoints.wide ? 1120 : 960) : isTablet ? 820 : 640;
  return { width, isDesktop, isTablet, isMobile: !isDesktop && !isTablet, gutter, contentMax };
}
