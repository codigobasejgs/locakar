import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = COMPANY.siteUrl;
  return [
    { url: base, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/plataforma`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/plataforma/termos`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/plataforma/privacidade`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
