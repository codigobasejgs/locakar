import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * App do Locatário instalável (versão web): manifest, ícone e nome da locadora no <head>
 * e o prompt de instalação do navegador. Os arquivos vêm do servidor em /pwa/<slug>/…
 */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  // Service worker do site (escopo "/"): requisito do Chrome para oferecer a instalação e base do push web.
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
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

const standalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const ios = () => typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const shortName = (name: string) => (name.length <= 15 ? name : name.split(/\s+/)[0].slice(0, 15));

function setHead(selector: string, tag: "link" | "meta", attrs: Record<string, string>) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(tag);
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

/** Atualiza o <head> com o app da locadora (antes de qualquer "Adicionar à tela de início"). */
export function useOrgAppHead(slug: string, name: string | undefined) {
  useEffect(() => {
    if (!slug || !name) return;
    setHead('link[rel="manifest"]', "link", { rel: "manifest", href: `/pwa/${slug}/app.webmanifest` });
    setHead('link[rel="apple-touch-icon"]', "link", { rel: "apple-touch-icon", href: `/pwa/${slug}/apple-180.png` });
    setHead('link[rel="icon"]', "link", { rel: "icon", type: "image/png", href: `/pwa/${slug}/icon-192.png` });
    setHead('meta[name="apple-mobile-web-app-capable"]', "meta", { name: "apple-mobile-web-app-capable", content: "yes" });
    setHead('meta[name="mobile-web-app-capable"]', "meta", { name: "mobile-web-app-capable", content: "yes" });
    setHead('meta[name="apple-mobile-web-app-title"]', "meta", { name: "apple-mobile-web-app-title", content: shortName(name) });
    setHead('meta[name="application-name"]', "meta", { name: "application-name", content: shortName(name) });
    document.title = name;
    document.documentElement.lang = "pt-BR";
  }, [slug, name]);
}

/** Estado do botão "Instalar": prompt nativo (Android/desktop), instruções (iPhone) ou nada (já instalado). */
export function useInstallApp() {
  const event = useSyncExternalStore(subscribe, () => deferred, () => null);
  const [installed, setInstalled] = useState(standalone);
  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const on = () => setInstalled(standalone());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const mode: "prompt" | "ios" | null = installed ? null : event ? "prompt" : ios() ? "ios" : null;
  return {
    mode,
    async install() {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      emit();
      return outcome === "accepted";
    },
  };
}
