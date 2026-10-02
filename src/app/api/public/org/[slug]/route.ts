import { loadOrgBySlug } from "@/lib/server/org-context";
import { corsHeaders, tenantOptions } from "@/lib/server/tenant";

/**
 * Marca pública da locadora para telas antes do login (app do locatário, link de cadastro).
 * Só dados de vitrine: nome, logos, cores, contatos de atendimento. Nada interno.
 */
export const dynamic = "force-dynamic";

export const OPTIONS = tenantOptions;

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = { ...corsHeaders(request), "Cache-Control": "public, max-age=300" };
  const { slug } = await params;
  const org = await loadOrgBySlug(slug.toLowerCase());
  if (!org || org.status === "cancelled") return Response.json({ error: "Locadora não encontrada." }, { status: 404, headers });
  const b = org.branding ?? {};
  return Response.json(
    {
      slug: org.slug,
      name: b.displayName || org.name,
      logo: b.logo ?? null,
      logoLight: b.logoLight ?? null,
      logoCompact: b.logoCompact ?? null,
      primary: b.primary ?? null,
      secondary: b.secondary ?? null,
      accent: b.accent ?? null,
      theme: b.theme ?? "system",
      whatsapp: org.whatsapp || org.phone || null,
      email: org.email,
      website: org.website,
      welcome: org.texts?.welcome ?? null,
      support: org.texts?.support ?? null,
      active: org.status !== "suspended",
    },
    { headers },
  );
}
