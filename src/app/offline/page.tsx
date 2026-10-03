import type { Metadata } from "next";
import { OfflineActions } from "@/components/pwa/offline-actions";
import { Logo } from "@/components/ui/logo";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Sem conexão",
  robots: { index: false, follow: false },
};

/** Página servida pelo service worker quando não há rede e a rota não está em cache. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-6 text-center">
      <div className="max-w-sm">
        <Logo priority className="mx-auto w-40 logo-glow" />
        <h1 className="mt-10 font-display text-2xl font-semibold">Você está sem conexão</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Verifique sua internet e tente novamente. Assim que a conexão voltar, a {COMPANY.name} abre normalmente.
        </p>
        <OfflineActions />
        <p className="mt-10 text-xs text-zinc-500">
          WhatsApp {COMPANY.whatsapp.display} · {COMPANY.site}
        </p>
      </div>
    </main>
  );
}
