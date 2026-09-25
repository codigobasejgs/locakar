import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { MotionProvider } from "@/components/layout/motion-provider";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { COMPANY } from "@/lib/company";
import { APP_NAMES, PWA, appleStartupImages } from "@/lib/pwa";
import "./globals.css";

const body = Manrope({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const heading = Sora({ variable: "--font-heading", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(COMPANY.siteUrl),
  title: { default: COMPANY.seo.title, template: `%s | ${COMPANY.name}` },
  description: COMPANY.seo.description,
  applicationName: APP_NAMES.site.short,
  manifest: PWA.siteManifest,
  keywords: ["locadora de veículos", "aluguel de carros", "LOCAKAR", "locação de veículos"],
  alternates: { canonical: "/" },
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: {
    capable: true,
    title: APP_NAMES.site.short,
    statusBarStyle: "black-translucent",
    startupImage: appleStartupImages(),
  },
  other: {
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": PWA.themeColor,
    "msapplication-TileImage": "/icons/icon-192.png",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: COMPANY.siteUrl,
    siteName: COMPANY.name,
    title: COMPANY.seo.title,
    description: COMPANY.seo.description,
  },
  twitter: { card: "summary_large_image", title: COMPANY.seo.title, description: COMPANY.seo.description },
};

export const viewport: Viewport = {
  themeColor: PWA.themeColor,
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // conteúdo sob o notch/Dynamic Island; margens via env(safe-area-inset-*)
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <MotionProvider>
          {children}
          <PwaProvider />
        </MotionProvider>
      </body>
    </html>
  );
}
