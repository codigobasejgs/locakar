import { FAQ, PLATFORM } from "@/components/platform-landing/content";
import { PlatformFooter } from "@/components/platform-landing/footer";
import { PlatformHeader } from "@/components/platform-landing/interactive";
import {
  Experience,
  Faq,
  FeatureGrid,
  FinalCta,
  Hero,
  HowItWorks,
  Insights,
  Integrations,
  Modules,
  Operations,
  Payments,
  Plans,
  Security,
  SmartContracts,
  TenantApp,
  VisualProof,
  WhiteLabel,
} from "@/components/platform-landing/sections";

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
        "Gestão de frota",
        "Clientes e CNH",
        "Reservas e locações",
        "Contratos com assinatura eletrônica",
        "Cobranças Asaas, InfinitePay e PIX",
        "Financeiro e relatórios",
        "Manutenção, multas e vistoria",
        "Aplicativo do locatário",
        "White label",
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
};

export default function PlatformPage() {
  return (
    <>
      {/* "<" escapado: conteúdo estático, mas segue a recomendação de JSON-LD sem injeção. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-[var(--pl-surface)] focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>
      <PlatformHeader />
      <main id="conteudo">
        <Hero />
        <VisualProof />
        <WhiteLabel />
        <Modules />
        <SmartContracts />
        <Payments />
        <Operations />
        <TenantApp />
        <Insights />
        <Experience />
        <Security />
        <Integrations />
        <HowItWorks />
        <FeatureGrid />
        <Plans />
        <Faq />
        <FinalCta />
      </main>
      <PlatformFooter />
    </>
  );
}
