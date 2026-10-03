import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";
import { APP_NAMES, PWA } from "@/lib/pwa";

export const dynamic = "force-static";

/** Manifest do app do site (escopo "/"). O painel tem manifest próprio em /admin/manifest.webmanifest. */
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: "/",
    name: APP_NAMES.site.name,
    short_name: APP_NAMES.site.short,
    description: COMPANY.seo.description,
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    theme_color: PWA.themeColor,
    background_color: PWA.backgroundColor,
    categories: ["travel", "business", "lifestyle"],
    prefer_related_applications: false,
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      { src: "/screenshots/mobile.png", sizes: "1080x1920", type: "image/png", form_factor: "narrow", label: "Página inicial da LOCAKAR" },
      { src: "/screenshots/desktop.png", sizes: "1920x1080", type: "image/png", form_factor: "wide", label: "LOCAKAR no computador" },
    ],
    shortcuts: [
      {
        name: "Nossa frota",
        short_name: "Frota",
        url: "/#frota",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        // Atalhos precisam estar no escopo do app: /contato redireciona para o WhatsApp oficial.
        name: "Falar no WhatsApp",
        short_name: "WhatsApp",
        url: "/contato",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
