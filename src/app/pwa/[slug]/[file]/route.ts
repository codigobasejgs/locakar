import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { onColor } from "@/lib/contrast";
import { PLATFORM } from "@/lib/platform";
import { PWA_FILES, PWA_ICONS, brandVersion, orgManifest, type PwaIconFile } from "@/lib/pwa-manifest";
import { loadOrgBySlug } from "@/lib/server/org-context";
import { SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Apps instaláveis por locadora: /pwa/<slug>/app.webmanifest (locatário), /pwa/<slug>/admin.webmanifest (gestão)
 * e os ícones gerados a partir do logo da locadora. Público: só nome, cores e logo (os mesmos da página /l/<slug>).
 * sharp (e não next/og): os logos enviados podem ser WebP, que o next/og não lê.
 */
export const dynamic = "force-dynamic";

/** Logo do Storage público da plataforma ou de /logos|/brand do próprio site (nunca URL arbitrária: evita SSRF). */
async function fetchLogo(url: string | undefined) {
  const base = SUPABASE_URL.replace(/\/+$/, "");
  if (url && /^\/(logos|brand)\/[\w./-]+\.(png|jpe?g|webp)$/i.test(url) && !url.includes("..")) {
    return readFile(path.join(process.cwd(), "public", url)).catch(() => null);
  }
  if (!url || !base || !url.startsWith(`${base}/storage/v1/object/public/`)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    return buf && buf.length <= 5 * 1024 * 1024 ? buf : null;
  } catch {
    return null;
  }
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Fundo na cor da locadora + logo centralizado (sem logo: iniciais). Maskable: conteúdo nos 60% centrais (o Android recorta). */
async function renderIcon(size: number, maskable: boolean, o: { name: string; primary: string; logo: Buffer | null }) {
  const inner = Math.round(size * (maskable ? 0.6 : 0.78));
  const canvas = () => sharp({ create: { width: size, height: size, channels: 4, background: o.primary } });
  if (o.logo) {
    try {
      const logo = await sharp(o.logo).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
      return await canvas().composite([{ input: logo, gravity: "center" }]).png().toBuffer();
    } catch {
      // logo corrompido: cai nas iniciais
    }
  }
  const text = initials(o.name);
  const fs = Math.round(inner * (text.length > 1 ? 0.5 : 0.62));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${fs}" fill="${onColor(o.primary)}">${text}</text></svg>`;
  return canvas().composite([{ input: Buffer.from(svg) }]).png().toBuffer();
}

export async function GET(request: Request, ctx: RouteContext<"/pwa/[slug]/[file]">) {
  const { slug, file } = await ctx.params;
  const org = await loadOrgBySlug(slug.toLowerCase());
  if (!org || org.status === "cancelled") return new Response("Locadora não encontrada.", { status: 404 });
  const b = org.branding ?? {};
  const name = (b.displayName || org.name).trim().slice(0, 45);
  const version = brandVersion(b, name);

  if (file in PWA_FILES) {
    const manifest = orgManifest(PWA_FILES[file as keyof typeof PWA_FILES], { slug: org.slug, name, theme: b.theme, version });
    return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300, s-maxage=300" } });
  }

  if (file in PWA_ICONS) {
    const { size, maskable } = PWA_ICONS[file as PwaIconFile];
    const primary = /^#[0-9a-f]{6}$/i.test(b.primary ?? "") ? b.primary! : PLATFORM.primary;
    const logo = (await fetchLogo(b.logoCompact)) ?? (await fetchLogo(b.logo)) ?? (await fetchLogo(b.logoLight));
    const png = await renderIcon(size, maskable, { name, primary, logo });
    // Com ?v= da marca atual o ícone é imutável (logo novo = versão nova); sem versão, cache curto.
    const versioned = new URL(request.url).searchParams.get("v") === version;
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300, s-maxage=3600" },
    });
  }

  return new Response("Arquivo não encontrado.", { status: 404 });
}
