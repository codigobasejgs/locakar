import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/assinar/", "/pagamento/", "/locatario/"] },
    sitemap: `${COMPANY.siteUrl}/sitemap.xml`,
  };
}
