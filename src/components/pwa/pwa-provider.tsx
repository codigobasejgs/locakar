"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useOnline, useServiceWorker } from "@/hooks/use-pwa";

/** Registra o service worker e mostra avisos globais: sem conexão e nova versão disponível. */
export function PwaProvider() {
  const online = useOnline();
  const { updateAvailable, applyUpdate } = useServiceWorker();

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5rem))] z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <AnimatePresence>
        {!online && (
          <motion.div
            key="offline"
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-400/30 bg-ink/90 px-4 py-2 text-xs font-medium text-amber-200 shadow-lg backdrop-blur-xl"
          >
            <WifiOff className="size-4" aria-hidden />
            Sem conexão — exibindo conteúdo salvo
          </motion.div>
        )}
        {updateAvailable && (
          <motion.div
            key="update"
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-magenta/40 bg-ink/90 py-2 pl-4 pr-2 text-sm shadow-glow backdrop-blur-xl"
          >
            Nova versão disponível
            <Button size="sm" onClick={applyUpdate}>
              <RefreshCw /> Atualizar
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
