/**
 * Apps instaláveis por locadora (white label): manifest do App do Locatário e do painel de gestão
 * com nome, ícone e cores de cada locadora. Puro (sem servidor): usado pela rota /pwa/<slug>/… e pelo painel.
 */
import type { MetadataRoute } from "next";
import { ROUTES } from "./constants";
import type { OrgBranding } from "@/types";

export type PwaApp = "app" | "admin";

/** Arquivos servidos em /pwa/<slug>/<arquivo>. */
export const PWA_FILES = {
  "app.webmanifest": "app",
  "admin.webmanifest": "admin",
} as const satisfies Record<string, PwaApp>;

export const PWA_ICONS = {
  "icon-192.png": { size: 192, maskable: false },
  "icon-512.png": { size: 512, maskable: false },
  "maskable-192.png": { size: 192, maskable: true },
  "maskable-512.png": { size: 512, maskable: true },
  "apple-180.png": { size: 180, maskable: false },
} as const;
export type PwaIconFile = keyof typeof PWA_ICONS;

/** Versão da marca: muda quando logo, cor ou nome mudam (força o navegador a baixar ícones novos). */
export function brandVersion(b: OrgBranding | null | undefined, name = "") {
  const s = [b?.logoCompact, b?.logo, b?.logoLight, b?.primary, name].join("|");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Nome curto da tela inicial (o sistema corta nomes longos): até 15 caracteres ou a primeira palavra. */
export const shortName = (name: string) => (name.length <= 15 ? name : name.split(/\s+/)[0].slice(0, 15));

export const pwaPath = (slug: string, file: string, version?: string) => `/pwa/${slug}/${file}${version ? `?v=${version}` : ""}`;

/** Fundo do app instalado (splash do Android e barra de status), seguindo o tema da locadora. */
const background = (theme?: OrgBranding["theme"]) => (theme === "light" ? "#F7F7F8" : "#0D0D0F");

export function orgManifest(app: PwaApp, o: { slug: string; name: string; theme?: OrgBranding["theme"]; version: string }): MetadataRoute.Manifest {
  const icon = (file: PwaIconFile) => ({ src: pwaPath(o.slug, file, o.version), sizes: `${PWA_ICONS[file].size}x${PWA_ICONS[file].size}`, type: "image/png" });
  const icons: MetadataRoute.Manifest["icons"] = [
    { ...icon("icon-192.png"), purpose: "any" },
    { ...icon("icon-512.png"), purpose: "any" },
    { ...icon("maskable-192.png"), purpose: "maskable" },
    { ...icon("maskable-512.png"), purpose: "maskable" },
  ];
  const color = background(app === "admin" ? "dark" : o.theme);
  const base = { lang: "pt-BR", dir: "ltr" as const, display: "standalone" as const, theme_color: color, background_color: color, icons };

  if (app === "admin") {
    // id fixo: um único app de gestão por aparelho, com a marca da locadora ativa (trocar de locadora atualiza nome e ícone).
    return {
      ...base,
      id: "/admin/",
      name: `${o.name} · Gestão`,
      short_name: shortName(o.name),
      description: `Gestão da ${o.name}: frota, locações, cobranças, contratos e financeiro.`,
      start_url: `${ROUTES.admin}?source=pwa`,
      scope: ROUTES.admin,
      display_override: ["window-controls-overlay", "standalone"],
      orientation: "any",
      categories: ["business", "productivity", "finance"],
      launch_handler: { client_mode: ["navigate-existing", "auto"] },
      shortcuts: [
        { name: "Nova locação", short_name: "Locações", url: ROUTES.rentals, icons: [icon("icon-192.png")] },
        { name: "Reservas", url: ROUTES.reservations, icons: [icon("icon-192.png")] },
        { name: "Financeiro", url: ROUTES.finance, icons: [icon("icon-192.png")] },
      ],
    };
  }
  // App do locatário: um app por locadora (id com o slug), abrindo direto na locadora certa.
  return {
    ...base,
    id: `/locatario?org=${o.slug}`,
    name: o.name,
    short_name: shortName(o.name),
    description: `App da ${o.name}: sua locação, pagamentos por Pix, documentos e vistoria.`,
    start_url: `/locatario?org=${o.slug}&source=pwa`,
    scope: "/locatario",
    orientation: "portrait",
    categories: ["travel", "business"],
  };
}
