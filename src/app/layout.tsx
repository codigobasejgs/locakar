import type { Metadata, Viewport } from "next";
import { Manrope, Sora } from "next/font/google";
import { MotionProvider } from "@/components/layout/motion-provider";
import { COMPANY } from "@/lib/company";
import "./globals.css";

const body = Manrope({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const heading = Sora({ variable: "--font-heading", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(COMPANY.siteUrl),
  title: { default: COMPANY.seo.title, template: `%s | ${COMPANY.name}` },
  description: COMPANY.seo.description,
  applicationName: COMPANY.name,
  keywords: ["locadora de veículos", "aluguel de carros", "LOCAKAR", "locação de veículos"],
  alternates: { canonical: "/" },
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
  themeColor: "#050505",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
