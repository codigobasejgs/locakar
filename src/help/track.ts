"use client";

/** Envia métricas da ajuda ao servidor sem bloquear a tela. Falhas são ignoradas (ajuda continua offline). */
export type HelpEvent =
  | { kind: "view"; article: string }
  | { kind: "feedback"; article: string; helpful: boolean; comment?: string }
  | { kind: "search"; query: string; results: number };

export function trackHelp(audience: "admin" | "tenant", event: HelpEvent) {
  try {
    const body = JSON.stringify({ ...event, audience });
    if (navigator.sendBeacon?.(new URL("/api/help", location.origin), new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/help", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    /* sem rede ou navegador antigo */
  }
}
