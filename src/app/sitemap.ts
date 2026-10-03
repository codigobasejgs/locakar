import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";
import { globalDb } from "@/lib/server/org-context";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = COMPANY.siteUrl;
  // Páginas públicas das locadoras ativas (/l/<endereço>). Sem banco no build: só as fixas.
  const { data } = process.env.SUPABASE_SECRET_KEY
    ? await globalDb().from("organizations").select("slug,updated_at").in("status", ["active", "trial", "past_due"])
    : { data: [] };
  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/plataforma`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/plataforma/termos`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/plataforma/privacidade`, changeFrequency: "yearly", priority: 0.2 },
    ...(data ?? []).map((o) => ({ url: `${base}/l/${o.slug}`, lastModified: o.updated_at as string, changeFrequency: "weekly" as const, priority: 0.7 })),
  ];
}
