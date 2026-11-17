import type { NextConfig } from "next";
import { SUPABASE_URL } from "./src/lib/supabase/env";

// Frota Easy (o SaaS) em frotaeasy.com.br; a locadora LOCAKAR segue com o site dela em locakar.com.br.
const PLATFORM_HOST = String.raw`(?:www\.)?frotaeasy\.com\.br`;
const LOCAKAR_HOST = String.raw`(?:www\.)?locakar\.com\.br`;

const nextConfig: NextConfig = {
  // Evita que um package-lock.json em pasta-pai seja tomado como raiz do workspace.
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: new URL(SUPABASE_URL).hostname, port: "", pathname: "/storage/v1/object/public/veiculos/**", search: "" }],
    maximumRedirects: 0,
  },
  // Captura de screenshots da Central de Ajuda roda num dev isolado (não disputa a pasta .next com outro dev).
  ...(process.env.HELP_DIST_DIR ? { distDir: process.env.HELP_DIST_DIR } : {}),
  // Logo lido do disco pelas rotas que geram PDF (lib/pdf.ts).
  outputFileTracingIncludes: {
    "/api/email": ["./public/logos/locakar-logo-light.png"],
    "/api/sign": ["./public/logos/locakar-logo-light.png"],
  },
  async redirects() {
    return [
      // A landing do sistema mudou de casa: locakar.com.br/plataforma → frotaeasy.com.br (cadastro, termos e Super Admin continuam abrindo onde estão).
      { source: "/plataforma", has: [{ type: "host", value: LOCAKAR_HOST }], destination: "https://www.frotaeasy.com.br/", permanent: true },
      // Domínio sem www → com www (um endereço canônico para SEO e cookies de sessão).
      { source: "/:path*", has: [{ type: "host", value: "frotaeasy.com.br" }], destination: "https://www.frotaeasy.com.br/:path*", permanent: true },
    ];
  },
  async rewrites() {
    return {
      // Raiz de frotaeasy.com.br mostra a landing da Frota Easy (o "/" de locakar.com.br continua sendo o site da locadora).
      beforeFiles: [{ source: "/", has: [{ type: "host", value: PLATFORM_HOST }], destination: "/plataforma" }],
      afterFiles: [
        // SPA do App do Locatário (Expo web export): rotas internas /locatario/* servem o index.html.
        { source: "/locatario/:path*", destination: "/locatario/index.html" },
      ],
      fallback: [],
    };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Câmera liberada só na própria origem (selfie da assinatura em /assinar).
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      {
        // Service worker: nunca em cache HTTP, para que atualizações cheguem na hora.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: "/:path*/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/(icons|splash|screenshots)/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/video/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
