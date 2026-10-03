import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Assinatura de contrato",
  robots: { index: false, follow: false },
  referrer: "no-referrer", // o token do link não vaza para sites externos
};

export default function SignLayout({ children }: { children: React.ReactNode }) {
  return children;
}
