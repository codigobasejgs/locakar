import { can } from "@/lib/permissions";
import { routeMatches } from "./access";
import { searchArticles, tokens } from "./search";
import type { HelpAccess, HelpArticle, TourDef, TourStep } from "./types";

/** Tour visível para o perfil: permissão real do papel + módulo do plano (plano sem o módulo = tour oculto). */
export function canTakeTour(tour: TourDef, access: HelpAccess) {
  if (access.audience !== "admin" || !access.role) return false;
  return can(access.role, tour.permission) && (!tour.feature || access.modules?.[tour.feature] !== false);
}
export const visibleTours = (tours: TourDef[], access: HelpAccess) => tours.filter((t) => canTakeTour(t, access));

/** Passos que a pessoa pode ver: tira os de telas sem permissão ou fora do plano; no modo rápido, só os marcados. */
export function tourSteps(tour: TourDef, access: HelpAccess, mode: "quick" | "full"): TourStep[] {
  const allowed = tour.steps.filter(
    (s) => (!s.permission || (access.role && can(access.role, s.permission))) && (!s.feature || access.modules?.[s.feature] !== false),
  );
  const quick = allowed.filter((s) => s.quick);
  return mode === "quick" && quick.length ? quick : allowed;
}
export const hasQuickMode = (tour: TourDef) => tour.steps.some((s) => s.quick) && tour.steps.some((s) => !s.quick);

/** Rota efetiva de cada passo: a dele, senão a do passo anterior, senão a do tour. */
export function stepRoutes(tour: TourDef, steps: TourStep[]) {
  let last = tour.route;
  return steps.map((s) => (last = s.route ?? last));
}

/** Tours da tela aberta (para o botão Ajuda e o convite da primeira visita). Jornadas e o tour geral ficam na Central. */
export function toursForRoute(tours: TourDef[], route: string, access: HelpAccess) {
  return visibleTours(tours, access).filter((t) => (t.kind === "modulo" || t.kind === "configuracao") && routeMatches(t.route, route));
}

export const chaptersOf = (steps: TourStep[]) => [...new Set(steps.map((s) => s.chapter).filter((c): c is string => Boolean(c)))];

/** Minutos restantes estimados a partir do tempo total do tour. */
export const minutesLeft = (tour: TourDef, index: number, total: number) => Math.max(1, Math.ceil((tour.minutes * (total - index)) / Math.max(total, 1)));

/** Troca {org} pelo nome da locadora (white label: nenhum texto do tour cita a marca da plataforma). */
export const brandText = (text: string, orgName: string) => text.replaceAll("{org}", orgName || "sua locadora");

/** Busca de tours com o mesmo motor da Central (sinônimos, acentos, erros de digitação). */
export function searchTours(tours: TourDef[], query: string) {
  const asArticle = (t: TourDef) =>
    ({
      slug: t.id, title: t.title, description: t.description, category: t.module, aliases: t.aliases, keywords: t.keywords,
      faq: [], problems: [], steps: t.steps.map((s) => ({ title: s.title, text: s.content })),
    }) as unknown as HelpArticle;
  const byId = new Map(tours.map((t) => [t.id, t]));
  // Desempate: frases de exemplo (aliases) citam vários assuntos; título + palavras-chave dizem do que o tour trata.
  const wanted = tokens(query);
  const focus = (t: TourDef) => {
    const own = new Set(tokens(`${t.title} ${t.keywords.join(" ")}`));
    return wanted.length ? (8 * wanted.filter((w) => own.has(w)).length) / wanted.length : 0;
  };
  return searchArticles(tours.map(asArticle), query)
    .map((r) => ({ tour: byId.get(r.article.slug)!, score: r.score + focus(byId.get(r.article.slug)!) }))
    .sort((a, b) => b.score - a.score);
}
