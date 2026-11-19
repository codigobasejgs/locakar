import { FAQ, PLATFORM } from "@/components/platform-landing/content";
import { PlatformFooter } from "@/components/platform-landing/footer";
import { OfferWidget, PlatformHeader, PromoBar } from "@/components/platform-landing/interactive";
import { brl, planPrice, promoDeadline } from "@/lib/plans";
import { publicPlans, recentSignups } from "@/lib/server/plan";
import { Automations, BeforeAfter, Bento, Copilot, Faq, FinalCta, Hero, Plans, Security, TrustBar, VideoTour, WhiteLabelApp, WhiteLabelPanel } from "@/components/platform-landing/sections";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: PLATFORM.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android, iOS",
      url: PLATFORM.url,
      description: PLATFORM.seo.description,
      inLanguage: "pt-BR",
      featureList: [
        "Gestão de frota com CRLV-e e FIPE",
        "Contratos com assinatura eletrônica",
        "Cobranças automáticas Pix, boleto e cartão",
        "Copiloto no WhatsApp",
        "Aplicativo do locatário white label",
        "Manutenção, multas e rastreamento",
      ],
    },
    { "@type": "Organization", name: PLATFORM.name, url: PLATFORM.url, logo: `${PLATFORM.url}/brand/frotaeasy/admin-512.png`, slogan: PLATFORM.slogan },
    { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

// Preços vêm do banco (Super Admin); a página é refeita a cada 5 min ou na hora ao salvar um plano.
export const revalidate = 300;

/** Landing da Frota Easy. Responde em /plataforma e na raiz de frotaeasy.com.br (rewrite em next.config.ts). */
export default async function PlatformPage() {
  const [plans, signups] = await Promise.all([publicPlans(), recentSignups()]);
  const from = Math.min(...plans.map((p) => planPrice(p).cents));
  const deadline = promoDeadline(plans);
  const promo = plans.filter((p) => planPrice(p).promo);
  const promoFrom = promo.length ? Math.min(...promo.map((p) => planPrice(p).cents)) : null;
  const offers = { "@type": "AggregateOffer", priceCurrency: "BRL", lowPrice: (from / 100).toFixed(2), offerCount: plans.length, description: `${PLATFORM.trialDays} dias grátis` };
  return (
    <>
      {/* "<" escapado: conteúdo estático, mas segue a recomendação de JSON-LD sem injeção. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ ...jsonLd, "@graph": jsonLd["@graph"].map((n, i) => (i === 0 ? { ...n, offers } : n)) }).replace(/</g, "\\u003c") }} />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-[var(--fe-surface)] focus:px-4 focus:py-3">
        Pular para o conteúdo
      </a>
      {deadline && promoFrom != null && <PromoBar label={`🚀 Oferta de lançamento: todos os recursos por ${brl(promoFrom)}/mês`} deadline={deadline} />}
      <PlatformHeader onLanding />
      <main id="conteudo">
        <Hero />
        <TrustBar />
        <VideoTour />
        <Bento />
        <Copilot />
        <Automations />
        <BeforeAfter />
        <WhiteLabelApp />
        <WhiteLabelPanel />
        <Security />
        <Plans plans={plans} />
        <Faq />
        <FinalCta />
      </main>
      <PlatformFooter />
      {(deadline || signups.length > 0) && <OfferWidget deadline={deadline} price={brl(promoFrom ?? from)} signups={signups} />}
    </>
  );
}
