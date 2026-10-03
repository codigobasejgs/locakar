"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/** Evento do Chromium (Android, Windows, macOS, ChromeOS, Edge). Ausente em Safari/Firefox. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/* ---------- Store global do prompt de instalação ----------
 * O evento dispara uma vez por carregamento, possivelmente antes do componente montar.
 * Capturamos no módulo para qualquer botão de instalação reaproveitar. */
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useInstallPrompt() {
  const event = useSyncExternalStore(subscribe, () => deferred, () => null);
  return {
    canPrompt: !!event,
    async prompt() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      emit();
      return outcome === "accepted";
    },
  };
}

/* ---------- Detecção de plataforma / modo ---------- */

const standaloneQuery = "(display-mode: standalone), (display-mode: window-controls-overlay), (display-mode: fullscreen)";

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(standaloneQuery).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad em Safari (iPadOS se identifica como Mac com toque). */
export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function useStandalone() {
  return useSyncExternalStore(
    (l) => {
      const mq = window.matchMedia(standaloneQuery);
      mq.addEventListener("change", l);
      return () => mq.removeEventListener("change", l);
    },
    isStandalone,
    () => false,
  );
}

export function useOnline() {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener("online", l);
      window.addEventListener("offline", l);
      return () => {
        window.removeEventListener("online", l);
        window.removeEventListener("offline", l);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/* ---------- Service worker ---------- */

/** Registra /sw.js (só em produção) e expõe quando há nova versão aguardando. */
export function useServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    let reloading = false;

    const track = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          // Só avisa se já havia uma versão controlando a página (não na primeira instalação).
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    };

    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    // Verifica atualização ao voltar para o app (PWA fica aberto por dias no celular).
    const onVisible = () => document.visibilityState === "visible" && registration?.update().catch(() => {});

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        track(reg);
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return {
    updateAvailable: !!waiting,
    applyUpdate: () => waiting?.postMessage({ type: "SKIP_WAITING" }),
  };
}
