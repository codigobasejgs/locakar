import { useMemo } from "react";
import { type ThemeColors } from "../constants/theme";
import { useTheme } from "../context/ThemeProvider";

/**
 * Estilos que dependem do tema: `const styles = useThemedStyles(makeStyles)`.
 * `makeStyles(c)` recebe a paleta ativa e só é recalculado quando o tema muda.
 */
export function useThemedStyles<T>(makeStyles: (c: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [makeStyles, colors]);
}
