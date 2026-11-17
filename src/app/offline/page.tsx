import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { OfflineActions } from "@/components/pwa/offline-actions";

export const metadata: Metadata = {
  title: "Sem conexão",
  robots: { index: false, follow: false },
};

/** Página servida pelo service worker quando não há rede e a rota não está em cache. Neutra: serve aos apps de todas as locadoras. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-6 text-center">
      <div className="max-w-sm">
        <WifiOff className="mx-auto size-12 text-zinc-400" aria-hidden />
        <h1 className="mt-8 font-display text-2xl font-semibold">Você está sem conexão</h1>
        <p className="mt-3 text-sm text-zinc-400">Verifique sua internet e tente novamente. Assim que a conexão voltar, o app abre normalmente.</p>
        <OfflineActions />
      </div>
    </main>
  );
}
