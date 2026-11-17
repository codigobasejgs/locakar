"use client";

import { useEffect } from "react";
import { brandVersion, pwaPath, shortName, type PwaApp } from "@/lib/pwa-manifest";
import type { OrgBranding } from "@/types";

/**
 * Troca manifest, ícone da tela de início (iOS) e nome do app pelos da locadora.
 * O head é do servidor (sem saber a locadora antes do login); aqui ele é atualizado assim que a marca carrega,
 * antes de a pessoa tocar em "Instalar".
 */
export function useOrgAppHead(app: PwaApp, org: { slug: string; name: string; branding?: OrgBranding | null } | null) {
  const slug = org?.slug;
  const name = (org?.branding?.displayName || org?.name || "").trim();
  const version = org ? brandVersion(org.branding, name) : "";

  useEffect(() => {
    if (!slug || !name) return;
    const file = app === "admin" ? "admin.webmanifest" : "app.webmanifest";
    const set = (selector: string, create: () => HTMLElement, apply: (el: HTMLElement) => void) => {
      let el = document.head.querySelector<HTMLElement>(selector);
      if (!el) {
        el = create();
        document.head.appendChild(el);
      }
      apply(el);
    };
    const link = (rel: string) => () => Object.assign(document.createElement("link"), { rel });
    const meta = (n: string) => () => Object.assign(document.createElement("meta"), { name: n });

    set('link[rel="manifest"]', link("manifest"), (el) => el.setAttribute("href", pwaPath(slug, file)));
    set('link[rel="apple-touch-icon"]', link("apple-touch-icon"), (el) => el.setAttribute("href", pwaPath(slug, "apple-180.png", version)));
    set('meta[name="apple-mobile-web-app-title"]', meta("apple-mobile-web-app-title"), (el) => el.setAttribute("content", shortName(name)));
    set('meta[name="application-name"]', meta("application-name"), (el) => el.setAttribute("content", shortName(name)));
    set('meta[name="apple-mobile-web-app-capable"]', meta("apple-mobile-web-app-capable"), (el) => el.setAttribute("content", "yes"));
  }, [app, slug, name, version]);
}
