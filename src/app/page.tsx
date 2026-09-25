import { FleetSection } from "@/components/landing/fleet-section";
import { AdminShortcut, FloatingWhatsApp } from "@/components/landing/floating-whatsapp";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { About, Benefits, FinalCta, HowItWorks } from "@/components/landing/sections";
import { VideoBackground } from "@/components/landing/video-background";
import { COMPANY } from "@/lib/company";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AutoRental",
  name: COMPANY.name,
  description: COMPANY.seo.description,
  url: COMPANY.siteUrl,
  telephone: COMPANY.whatsapp.international,
  logo: `${COMPANY.siteUrl}/logos/locakar-logo.png`,
  image: `${COMPANY.siteUrl}/opengraph-image.jpg`,
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-ink"
      >
        Pular para o conteúdo
      </a>
      <VideoBackground />
      <Header />
      <main id="conteudo" className="relative z-10">
        <Hero />
        <FleetSection />
        <HowItWorks />
        <Benefits />
        <About />
        <FinalCta />
      </main>
      <div className="relative z-10">
        <Footer />
      </div>
      <FloatingWhatsApp />
      <AdminShortcut />
    </>
  );
}
