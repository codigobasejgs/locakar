import { CarFront, Fuel, MessageCircle, Settings2, Smartphone, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { onColor } from "@/lib/contrast";
import { globalDb, loadOrgBySlug, siteUrl } from "@/lib/server/org-context";
import { formatCurrency } from "@/lib/utils";

/**
 * Página pública de cada locadora (link de divulgação): marca, frota disponível e atalhos
 * para WhatsApp e app do locatário. Só dados de vitrine — nada de placa, Renavam ou valores de compra.
 */
export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const org = await loadOrgBySlug(slug.toLowerCase());
  if (!org || org.status === "cancelled" || org.status === "suspended") return null;
  const { data } = await globalDb()
    .from("vehicles")
    .select("id,name,brand,model,year,image,photos,category,transmission,fuel,seats,daily_rate,weekly_rate")
    .eq("organization_id", org.id)
    .neq("status", "sold")
    .order("name")
    .limit(60);
  return { org, fleet: data ?? [] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const org = await loadOrgBySlug(slug.toLowerCase());
  if (!org) return { title: "Locadora não encontrada", robots: { index: false } };
  const name = org.branding?.displayName || org.name;
  const description = `Aluguel de veículos com a ${name}${org.city ? ` em ${org.city}${org.state ? `/${org.state}` : ""}` : ""}. Veja a frota e fale pelo WhatsApp.`;
  return {
    title: { absolute: `${name} · Aluguel de veículos` },
    description,
    alternates: { canonical: `/l/${org.slug}` },
    openGraph: { title: name, description, url: `/l/${org.slug}`, images: org.branding?.logo ? [org.branding.logo] : undefined },
  };
}

export default async function OrgPublicPage({ params }: Props) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { org, fleet } = data;
  const b = org.branding ?? {};
  const name = b.displayName || org.name;
  const primary = /^#[0-9a-f]{6}$/i.test(b.primary ?? "") ? b.primary! : "#2563eb";
  const on = onColor(primary);
  const phone = (org.whatsapp || org.phone || "").replace(/\D/g, "");
  const wa = (text: string) => (phone ? `https://wa.me/${phone.startsWith("55") ? phone : `55${phone}`}?text=${encodeURIComponent(text)}` : null);
  const appUrl = `${siteUrl()}/locatario?org=${org.slug}`;
  const logo = b.logo || b.logoLight;

  return (
    <main className="min-h-dvh bg-[#07070a] text-white" style={{ ["--brand" as string]: primary }}>
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={name} className="h-10 w-auto max-w-44 object-contain" />
          ) : (
            <span className="font-display text-xl font-bold">{name}</span>
          )}
          {wa(`Olá, ${name}! Quero alugar um veículo.`) && (
            <a href={wa(`Olá, ${name}! Quero alugar um veículo.`)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: primary, color: on }}>
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          )}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Aluguel de veículos{org.city ? ` · ${org.city}${org.state ? `/${org.state}` : ""}` : ""}</p>
        <h1 className="mt-3 max-w-2xl text-balance font-display text-3xl font-bold sm:text-5xl">{name}</h1>
        <p className="mt-4 max-w-xl text-white/70">{org.texts?.welcome || "Escolha o veículo, fale com a nossa equipe e acompanhe sua locação, pagamentos e documentos pelo aplicativo."}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={appUrl} className="inline-flex items-center gap-2 rounded-xl px-5 py-3 font-semibold" style={{ background: primary, color: on }}>
            <Smartphone className="size-5" /> Alugar pelo app
          </a>
          {wa(`Olá, ${name}! Quero saber a disponibilidade de veículos.`) && (
            <a href={wa(`Olá, ${name}! Quero saber a disponibilidade de veículos.`)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold hover:bg-white/5">
              <MessageCircle className="size-5" /> Falar no WhatsApp
            </a>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="font-display text-xl font-semibold">Nossa frota</h2>
        {fleet.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-white/10 p-6 text-sm text-white/60">A frota será publicada em breve. Fale com a gente pelo WhatsApp para consultar disponibilidade.</p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fleet.map((v) => {
              const photo = (Array.isArray(v.photos) && typeof v.photos[0] === "string" ? v.photos[0] : null) || v.image;
              const msg = wa(`Olá, ${name}! Tenho interesse no ${v.name} (${v.year}).`);
              return (
                <article key={v.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <div className="aspect-[16/10] bg-white/5">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={v.name} loading="lazy" className="size-full object-cover" />
                    ) : (
                      <div className="grid size-full place-items-center text-white/30"><CarFront className="size-10" /></div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <h3 className="font-semibold">{v.name}</h3>
                      <p className="text-xs text-white/50">{[v.category, v.year].filter(Boolean).join(" · ")}</p>
                    </div>
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                      {v.transmission && <li className="inline-flex items-center gap-1"><Settings2 className="size-3.5" />{v.transmission}</li>}
                      {v.fuel && <li className="inline-flex items-center gap-1"><Fuel className="size-3.5" />{v.fuel}</li>}
                      {v.seats && <li className="inline-flex items-center gap-1"><Users className="size-3.5" />{v.seats} lugares</li>}
                    </ul>
                    <div className="flex items-end justify-between gap-2">
                      <p className="text-sm">
                        {v.weekly_rate ? <><span className="text-lg font-bold">{formatCurrency(Number(v.weekly_rate))}</span><span className="text-white/50">/semana</span></> : v.daily_rate ? <><span className="text-lg font-bold">{formatCurrency(Number(v.daily_rate))}</span><span className="text-white/50">/dia</span></> : <span className="text-white/50">Consulte</span>}
                      </p>
                      {msg && (
                        <a href={msg} target="_blank" rel="noopener noreferrer" className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: primary, color: on }}>
                          Tenho interesse
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-white/40">
          <span>{org.legal_name || name}{org.document?.length === 14 ? ` · CNPJ ${org.document.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}` : ""}</span>
          <span>{org.texts?.footer || ""}</span>
        </div>
      </footer>
    </main>
  );
}
