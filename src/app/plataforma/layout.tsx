import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { PLATFORM } from "@/components/platform-landing/content";
import "@/components/platform-landing/platform.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-montserrat", display: "swap" });

const OG = "/brand/frotaeasy/og-image.jpg";

export const metadata: Metadata = {
  metadataBase: new URL(PLATFORM.url),
  title: { absolute: PLATFORM.seo.title, template: `%s | ${PLATFORM.name}` },
  description: PLATFORM.seo.description,
  applicationName: PLATFORM.name,
  keywords: ["Frota Easy", "software para locadora", "sistema para locadora de veículos", "gestão de locadora", "gestão de frota", "aplicativo para locadora"],
  alternates: { canonical: "/" },
  // Ícones próprios da Frota Easy (substituem os do layout raiz, que são do site da LOCAKAR).
  icons: {
    icon: [{ url: "/brand/frotaeasy/favicon-48.png", sizes: "48x48", type: "image/png" }, { url: "/brand/frotaeasy/admin-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/brand/frotaeasy/admin-180.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: null,
  appleWebApp: { title: PLATFORM.name },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: PLATFORM.name,
    title: PLATFORM.seo.title,
    description: PLATFORM.seo.description,
    images: [{ url: OG, width: 1200, height: 630, alt: `${PLATFORM.name} — ${PLATFORM.slogan}` }],
  },
  twitter: { card: "summary_large_image", title: PLATFORM.seo.title, description: PLATFORM.seo.description, images: [OG] },
};

export const viewport: Viewport = { colorScheme: "dark", themeColor: "#0B0B0F" };

export default function PlatformLayout({ children }: LayoutProps<"/plataforma">) {
  return <div className={`fe ${montserrat.variable}`}>{children}</div>;
}
