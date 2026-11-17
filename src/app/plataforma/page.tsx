import { FAQ, PLATFORM } from "@/components/platform-landing/content";
import { PlatformFooter } from "@/components/platform-landing/footer";
import { PlatformHeader } from "@/components/platform-landing/interactive";
import { Automations, BeforeAfter, Bento, Copilot, Faq, FinalCta, Hero, Plans, Security, TrustBar, WhiteLabelApp, WhiteLabelPanel } from "@/components/platform-landing/sections";

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
      offers: { "@type": "Offer", price: "0", priceCurrency: "BRL", description: `${PLATFORM.trialDays} dias grátis` },
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

/** Landing da Frota Easy. Responde em /plataforma e na raiz de frotaeasy.com.br (rewrite em next.config.ts). */
export default function PlatformPage() {
  return (
    <>
      {/* "<" escapado: conteúdo estático, mas segue a recomendação de JSON-LD sem injeção. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-[var(--fe-surface)] focus:px-4 focus:py-3">
        Pular para o conteúdo
      </a>
      <PlatformHeader />
      <main id="conteudo">
        <Hero />
        <TrustBar />
        <Bento />
        <Copilot />
        <Automations />
        <BeforeAfter />
        <WhiteLabelApp />
        <WhiteLabelPanel />
        <Security />
        <Plans />
        <Faq />
        <FinalCta />
      </main>
      <PlatformFooter />
    </>
  );
}
