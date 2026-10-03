import type { MetadataRoute } from "next";
import { ROUTES } from "@/lib/constants";
import { APP_NAMES, PWA } from "@/lib/pwa";

export const dynamic = "force-static";

/** Manifest do sistema de gestão: app separado, com escopo "/admin" e ícone próprio. */
export function GET() {
  const icon = (size: number) => ({ src: `/icons/admin-${size}.png`, sizes: `${size}x${size}`, type: "image/png" });
  const manifest: MetadataRoute.Manifest = {
    id: "/admin/",
    name: APP_NAMES.admin.name,
    short_name: APP_NAMES.admin.short,
    description: "Sistema de gestão da LOCAKAR: frota, locações, reservas e financeiro.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: `${ROUTES.admin}?source=pwa`,
    // Sem barra final: o Next redireciona /admin/ → /admin. Escopo é prefixo, cobre /admin/*.
    scope: ROUTES.admin,
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "any",
    theme_color: PWA.themeColor,
    background_color: PWA.backgroundColor,
    categories: ["business", "productivity", "finance"],
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    icons: [
      { ...icon(192), purpose: "any" },
      { ...icon(512), purpose: "any" },
      { ...icon(192), purpose: "maskable" },
      { ...icon(512), purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nova locação", short_name: "Locações", url: ROUTES.rentals, icons: [icon(192)] },
      { name: "Reservas", url: ROUTES.reservations, icons: [icon(192)] },
      { name: "Veículos", url: ROUTES.vehicles, icons: [icon(192)] },
      { name: "Financeiro", url: ROUTES.finance, icons: [icon(192)] },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
