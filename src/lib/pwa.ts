/**
 * Configuração do PWA — fonte única para manifests, metadata e o gerador de ícones.
 * Dois apps instaláveis: o site (escopo "/") e o sistema de gestão (escopo "/admin").
 */
import { COMPANY } from "./company";

export const PWA = {
  themeColor: "#050505",
  backgroundColor: "#050505",
  siteManifest: "/manifest.webmanifest",
  adminManifest: "/admin/manifest.webmanifest",
} as const;

/** Dispositivos iOS/iPadOS para splash screens: largura e altura CSS, densidade, e se também gera a versão em paisagem. */
export const APPLE_SPLASH: ReadonlyArray<readonly [number, number, number, boolean]> = [
  [375, 667, 2, false], // iPhone SE / 8
  [414, 736, 3, false], // iPhone 8 Plus
  [375, 812, 3, false], // iPhone X / XS / 11 Pro / 12-13 mini
  [414, 896, 2, false], // iPhone XR / 11
  [414, 896, 3, false], // iPhone XS Max / 11 Pro Max
  [390, 844, 3, false], // iPhone 12 / 13 / 14
  [428, 926, 3, false], // iPhone 12-13 Pro Max / 14 Plus
  [393, 852, 3, false], // iPhone 14 Pro / 15 / 16
  [430, 932, 3, false], // iPhone 14 Pro Max / 15 Plus / 16 Plus
  [402, 874, 3, false], // iPhone 16 Pro
  [440, 956, 3, false], // iPhone 16 Pro Max
  [744, 1133, 2, true], // iPad mini 6
  [810, 1080, 2, true], // iPad 9ª geração
  [820, 1180, 2, true], // iPad Air / iPad 10ª geração
  [834, 1194, 2, true], // iPad Pro 11"
  [834, 1210, 2, true], // iPad Pro 11" M4
  [1024, 1366, 2, true], // iPad Pro 12,9"
  [1032, 1376, 2, true], // iPad Pro 13" M4
];

/** Links `apple-touch-startup-image` com media query exata de cada aparelho e orientação. */
export function appleStartupImages() {
  return APPLE_SPLASH.flatMap(([w, h, dpr, landscape]) => {
    const media = (orientation: string) =>
      `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orientation})`;
    const portrait = { url: `/splash/${w * dpr}x${h * dpr}.png`, media: media("portrait") };
    return landscape ? [portrait, { url: `/splash/${h * dpr}x${w * dpr}.png`, media: media("landscape") }] : [portrait];
  });
}

export const APP_NAMES = {
  site: { name: `${COMPANY.name} — Locadora de Veículos`, short: COMPANY.name },
  admin: { name: `${COMPANY.name} Gestão`, short: "LOCAKAR Gestão" },
} as const;
