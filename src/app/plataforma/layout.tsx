import type { Metadata, Viewport } from "next";
import { PLATFORM } from "@/components/platform-landing/content";
import "@/components/platform-landing/platform.css";

export const metadata: Metadata = {
  title: { absolute: PLATFORM.seo.title, template: `%s | ${PLATFORM.name}` },
  description: PLATFORM.seo.description,
  applicationName: PLATFORM.name,
  keywords: ["software para locadora", "sistema para locadora de veículos", "gestão de locadora", "gestão de frota", "aplicativo para locadora"],
  alternates: { canonical: "/plataforma" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/plataforma",
    siteName: PLATFORM.name,
    title: PLATFORM.seo.title,
    description: PLATFORM.seo.description,
  },
  twitter: { card: "summary_large_image", title: PLATFORM.seo.title, description: PLATFORM.seo.description },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#07090c" },
  ],
};

export default function PlatformLayout({ children }: LayoutProps<"/plataforma">) {
  return <div className="pl font-sans">{children}</div>;
}
