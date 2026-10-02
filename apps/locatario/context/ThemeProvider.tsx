import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, ColorSchemeName, Platform, View } from "react-native";
import {
  DarkPalette,
  LightPalette,
  brandedPalette,
  setActiveBrand,
  setActiveTheme,
  type ThemeColors,
  type ThemeMode,
  type ThemeName,
} from "../constants/theme";
import { readCache, writeCache } from "../services/cache";
import { useOrg } from "./OrgProvider";

interface ThemeContextValue {
  theme: ThemeName;
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
  /** Logo da locadora (URL) ou o logo padrão empacotado. */
  logoSource: number | { uri: string };
  /** Nome exibido da locadora. */
  brandName: string;
}

const THEME_CACHE_KEY = "theme_mode";

const LOGO_LIGHT = require("../assets/logo-light.png");
const LOGO_DARK = require("../assets/logo-dark.png");

export const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(mode: ThemeMode, systemScheme: ColorSchemeName | null | undefined): ThemeName {
  if (mode === "system") {
    return systemScheme === "light" ? "light" : "dark";
  }
  return mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName | null | undefined>(() => Appearance.getColorScheme());
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    readCache<ThemeMode>(THEME_CACHE_KEY).then((saved) => {
      if (alive && saved && (saved === "dark" || saved === "light" || saved === "system")) {
        setModeState(saved);
      }
      if (alive) setLoaded(true);
    });

    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const { brand } = useOrg();
  const theme: ThemeName = useMemo(() => resolveTheme(mode, systemScheme), [mode, systemScheme]);
  // Antes do render dos filhos: quem ainda lê `Colors` direto já pega a paleta certa.
  setActiveTheme(theme);
  setActiveBrand(brand);

  useEffect(() => {
    // Na Web, aplica data-theme e classes no documentElement para CSS externo e scrollbar
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const root = document.documentElement;
      root.setAttribute("data-theme", theme);
      if (theme === "light") {
        root.classList.add("light");
        root.classList.remove("dark");
      } else {
        root.classList.add("dark");
        root.classList.remove("light");
      }
    }
  }, [theme]);

  const setMode = async (nextMode: ThemeMode) => {
    setModeState(nextMode);
    await writeCache(THEME_CACHE_KEY, nextMode);
  };

  const toggleTheme = async () => {
    const next = theme === "dark" ? "light" : "dark";
    await setMode(next);
  };

  const colors = useMemo(() => brandedPalette(theme === "light" ? LightPalette : DarkPalette, theme, brand), [theme, brand]);
  // Logo da locadora: no tema claro prefere a versão para fundo claro (logoLight é "para fundo claro").
  const remote = theme === "light" ? brand?.logoLight || brand?.logo : brand?.logo || brand?.logoLight;
  const logoSource = useMemo(() => (remote ? { uri: remote } : theme === "light" ? LOGO_DARK : LOGO_LIGHT), [remote, theme]);
  const brandName = brand?.name || "LOCAKAR";

  const value = useMemo(
    () => ({
      theme,
      mode,
      isDark: theme === "dark",
      colors,
      setMode,
      toggleTheme,
      logoSource,
      brandName,
    }),
    [theme, mode, colors, logoSource, brandName],
  );

  // Sem flash: nada é desenhado até ler a preferência salva (leitura local, milissegundos).
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback seguro caso usado fora do provider
    return {
      theme: "dark" as ThemeName,
      mode: "dark" as ThemeMode,
      isDark: true,
      colors: DarkPalette,
      setMode: async () => {},
      toggleTheme: async () => {},
      logoSource: LOGO_LIGHT,
      brandName: "LOCAKAR",
    };
  }
  return ctx;
}
