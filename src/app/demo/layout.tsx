import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { PLATFORM } from "@/lib/platform";
import "@/components/platform-landing/platform.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-montserrat", display: "swap" });

export const metadata: Metadata = {
  title: { absolute: `Demonstração ao vivo | ${PLATFORM.name}` },
  description: `Teste o ${PLATFORM.name} agora: painel da locadora e app do locatário com duas locadoras fictícias, sem cadastro.`,
  alternates: { canonical: "/demo" },
  manifest: null,
  icons: { icon: [{ url: "/brand/frotaeasy/favicon-48.png", sizes: "48x48", type: "image/png" }], apple: [{ url: "/brand/frotaeasy/admin-180.png", sizes: "180x180" }] },
  openGraph: { images: ["/brand/frotaeasy/og-image.jpg"] },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <div className={`fe ${montserrat.variable}`}>{children}</div>;
}
