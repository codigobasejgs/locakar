/**
 * Eventos de produto da landing comercial. Sem dependência nem envio próprio:
 * se houver um gerenciador de tags (window.dataLayer), entrega o evento; senão, não faz nada.
 * ponytail: sem consentimento/cookies porque nada é coletado; ao ligar GA/GTM, condicionar ao consentimento.
 */
export type TrackEvent = "hero_cta_clicked" | "demo_requested" | "whatsapp_clicked" | "features_viewed" | "pricing_viewed";

export function track(event: TrackEvent, params: Record<string, string> = {}) {
  if (typeof window === "undefined") return;
  const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
  if (Array.isArray(layer)) layer.push({ event, ...params });
}
