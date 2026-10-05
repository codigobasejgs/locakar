"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/env";
import { setTourActive } from "@/lib/tour-flag";
import { routeMatches } from "../access";
import {
  completeTour, emptyTourState, mergeTourState, moveTour, pauseTour, rateTour, readTourState, saveTourState, skipTour, startTour,
  tourStateKey, type TourMode, type TourRecord, type TourState,
} from "../tour-progress";
import { brandText, canTakeTour, minutesLeft, stepRoutes, tourSteps } from "../tours";
import type { TourDef, TourStep } from "../types";
import { helpStorage, useHelp } from "./context";
import { TourOverlay } from "./tour-overlay";
import { TourCompletion, TourExitPrompt } from "./tour-dialogs";

type Catalog = { tours: TourDef[]; videos: Record<string, string> };
interface Running { tour: TourDef; mode: TourMode; steps: TourStep[]; routes: string[]; index: number; dir: 1 | -1 }
interface TourContextValue {
  state: TourState;
  catalog: Catalog | null;
  /** Carrega o catálogo sob demanda (fora do pacote inicial do painel). */
  loadCatalog: () => Promise<Catalog>;
  start: (tourId: string, mode?: TourMode, resume?: boolean) => Promise<void>;
  dismissWelcome: (value: "later" | "done") => void;
  markPrompted: (route: string) => void;
  running: boolean;
  /** Progresso já lido do aparelho: só então decidimos se mostramos convites (evita piscar). */
  loaded: boolean;
}
const Ctx = createContext<TourContextValue | null>(null);
/** null fora do painel (ex.: Central do locatário, que não tem tours). */
export const useTours = () => useContext(Ctx);

let catalogPromise: Promise<Catalog> | null = null;
const fetchCatalog = () => (catalogPromise ??= import("../content/tours").then((m) => ({ tours: m.tours, videos: m.videos })));

/** Telemetria de uso do tour: só ids e números de passo, nunca texto digitado. Falha em silêncio. */
function track(event: string, tour: TourDef, step?: number, stepId?: string) {
  if (!isSupabaseEnabled) return;
  void getSupabase().from("tour_events").insert({ tour_id: tour.id, version: tour.version, event, step: step ?? null, step_id: stepId ?? null }).then(() => {}, () => {});
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** O mesmo alvo pode existir duas vezes (menu do computador e do celular): vale o que está visível. */
const find = (id: string) => [...document.querySelectorAll(`[data-tour="${CSS.escape(id)}"]`)].find((el) => el.getClientRects().length) ?? null;
/** Fecha formulários e o menu do celular (ambos fecham com Esc). */
const closeDialogs = () => {
  if (document.querySelector('[role="dialog"][data-state="open"], [aria-label="Menu administrativo"]')) document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
};
async function waitFor(id: string, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const el = find(id);
    if (el) return el;
    await wait(120);
  }
  return null;
}
const devWarn = (msg: string) => process.env.NODE_ENV !== "production" && console.warn(msg);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { identity, access, base } = useHelp();
  const router = useRouter();
  const pathname = usePathname();
  const key = tourStateKey(identity.user, identity.org);
  const [state, setState] = useState<TourState>(emptyTourState);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [run, setRun] = useState<Running | null>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [finished, setFinished] = useState<TourDef | null>(null);
  const [loaded, setLoaded] = useState(false);
  const resolving = useRef(0);
  const viewed = useRef(new Set<string>());

  // Aparelho primeiro (instantâneo), servidor depois (outros aparelhos). Vence o registro mais recente.
  useEffect(() => {
    let alive = true;
    // Trocou de conta ou locadora: encerra o tour em andamento e recarrega o progresso certo.
    resolving.current++;
    Promise.resolve().then(() => {
      if (!alive) return;
      setRun(null);
      setFinished(null);
      setState(readTourState(helpStorage(), key));
      setLoaded(true);
    });
    if (isSupabaseEnabled && identity.user !== "anon" && identity.org !== "none") {
      getSupabase()
        .from("tour_progress")
        .select("tour_id, version, status, mode, step, furthest, completed_versions, feedback, updated_at")
        .eq("organization_id", identity.org)
        .then(({ data }) => {
          if (!alive || !data) return;
          const remote: Record<string, TourRecord> = {};
          for (const r of data) remote[r.tour_id] = { version: r.version, status: r.status, mode: r.mode, step: r.step, furthest: r.furthest, completedVersions: r.completed_versions ?? [], feedback: r.feedback ?? undefined, updatedAt: r.updated_at };
          setState((s) => mergeTourState(s, remote));
        }, () => {});
    }
    return () => {
      alive = false;
    };
  }, [key, identity.user, identity.org]);

  const persist = useCallback(
    (next: TourState, tourId?: string) => {
      saveTourState(helpStorage(), key, next);
      const r = tourId && next.tours[tourId];
      if (!r || !isSupabaseEnabled || identity.user === "anon" || identity.org === "none") return;
      void getSupabase()
        .from("tour_progress")
        .upsert({ organization_id: identity.org, tour_id: tourId, version: r.version, status: r.status, mode: r.mode, step: r.step, furthest: r.furthest, completed_versions: r.completedVersions, feedback: r.feedback ?? null, updated_at: r.updatedAt }, { onConflict: "user_id,organization_id,tour_id" })
        .then(() => {}, () => {});
    },
    [key, identity.user, identity.org],
  );
  const update = useCallback(
    (fn: (s: TourState) => TourState, tourId?: string) =>
      setState((s) => {
        const next = fn(s);
        persist(next, tourId);
        return next;
      }),
    [persist],
  );

  const loadCatalog = useCallback(async () => {
    const c = await fetchCatalog();
    setCatalog(c);
    return c;
  }, []);

  const start = useCallback(
    async (tourId: string, mode: TourMode = "full", resume = false) => {
      const c = await loadCatalog();
      const tour = c.tours.find((t) => t.id === tourId);
      if (!tour) return void devWarn(`TourNotFound: ${tourId}`);
      const steps = tourSteps(tour, access, mode);
      if (!steps.length) return;
      const prev = state.tours[tour.id];
      const index = resume && prev && prev.version === tour.version && prev.mode === mode ? Math.min(prev.step, steps.length - 1) : 0;
      viewed.current.clear();
      setFinished(null);
      setExiting(false);
      setRun({ tour, mode, steps, routes: stepRoutes(tour, steps), index, dir: 1 });
      update((s) => startTour(s, tour, mode, index), tour.id);
      track("tour_started", tour, index);
    },
    [access, loadCatalog, state.tours, update],
  );

  useEffect(() => setTourActive(Boolean(run)), [run]);
  useEffect(() => () => setTourActive(false), []);

  // Leva cada passo à tela dele: navega, abre o controle seguro indicado, espera o alvo e rola até ele.
  const index = run?.index ?? -1;
  useEffect(() => {
    if (!run) return;
    const step = run.steps[run.index];
    const route = run.routes[run.index];
    const job = ++resolving.current;
    const alive = () => job === resolving.current;
    const go = async () => {
      setReady(false);
      setTarget(null);
      const here = () => window.location.pathname + window.location.hash;
      if (!routeMatches(route, here())) {
        const [path, hash] = route.split("#");
        if (/\[[^\]]+\]/.test(path)) {
          // Rota com parâmetro (ex.: detalhes de uma locação): vai à lista e abre o primeiro item.
          if (step.via && !routeMatches(step.via, window.location.pathname)) router.push(step.via);
          const link = step.click ? await waitFor(step.click, 6000) : null;
          if (!alive()) return;
          if (link instanceof HTMLElement) link.click();
          const end = Date.now() + 6000;
          while (alive() && Date.now() < end && !routeMatches(path, window.location.pathname)) await wait(150);
        } else if (window.location.pathname !== path) {
          router.push(route);
          const end = Date.now() + 8000;
          while (alive() && Date.now() < end && window.location.pathname !== path) await wait(120);
        } else if (hash) {
          window.location.hash = hash; // abas de Configurações escutam hashchange
        }
      }
      if (!alive()) return;
      // Fecha formulários do passo anterior: avançar nunca deixa uma janela aberta sem querer.
      const navStep = step.target?.startsWith("nav-");
      if (!step.dialog && !(navStep && document.querySelector('[aria-label="Menu administrativo"]'))) {
        closeDialogs();
        await wait(60);
      }
      // Item do menu com o menu lateral escondido (celular/tablet): abre o menu de forma controlada.
      if (navStep && !find(step.target!)) {
        const opener = find("nav-open-menu");
        if (opener instanceof HTMLElement) {
          opener.click();
          await wait(400);
        }
      }
      if (step.click && !/\[[^\]]+\]/.test(route.split("#")[0])) {
        const ctrl = await waitFor(step.click, 4000);
        if (!alive()) return;
        const alreadyOpen = step.dialog && step.target && find(step.target);
        if (ctrl instanceof HTMLElement && !alreadyOpen) ctrl.click();
        else if (!ctrl) devWarn(`TourTargetNotFound: ${step.click} (${run.tour.id}/${step.id})`);
      }
      let el: Element | null = null;
      if (step.target) {
        el = await waitFor(step.target, step.optional ? 1500 : 5000);
        if (!alive()) return;
        if (!el) {
          devWarn(`TourTargetNotFound: ${step.target} (${run.tour.id}/${step.id})`);
          // Elemento ausente nesta conta/tela: pula passos opcionais no sentido em que a pessoa ia;
          // sem para onde pular (ou passo obrigatório), vira explicação centralizada.
          const skipTo = run.index + run.dir;
          if (step.optional && skipTo >= 0 && skipTo < run.steps.length) return setRun((r) => (r && r.index === index ? { ...r, index: skipTo } : r));
        }
      }
      if (el) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
        await wait(reduce ? 50 : 350);
      }
      if (!alive()) return;
      setTarget(el);
      setReady(true);
      if (!viewed.current.has(step.id)) {
        viewed.current.add(step.id);
        track("tour_step_viewed", run.tour, run.index, step.id);
      }
    };
    void go();
    // index muda a cada passo; run muda ao iniciar outro tour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.tour.id, run?.mode, index]);

  // Sair da tela por conta própria (ex.: menu) durante o tour: pausa, para continuar depois.
  useEffect(() => {
    if (!run || !ready) return;
    const route = run.routes[run.index].split("#")[0];
    if (!routeMatches(route, pathname)) {
      // A navegação é externa ao tour (a pessoa clicou no menu): pausar e encerrar aqui é sincronizar com ela.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      update((s) => pauseTour(s, run.tour.id), run.tour.id);
      track("tour_abandoned", run.tour, run.index);
      resolving.current++;
      setRun(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const goTo = useCallback(
    (i: number) => {
      if (!run) return;
      setRun({ ...run, index: i, dir: i >= run.index ? 1 : -1 });
      update((s) => moveTour(s, run.tour.id, i), run.tour.id);
    },
    [run, update],
  );
  const next = useCallback(() => {
    if (!run) return;
    if (run.index < run.steps.length - 1) return goTo(run.index + 1);
    update((s) => completeTour(s, run.tour.id, run.steps.length), run.tour.id);
    track("tour_completed", run.tour, run.index);
    closeDialogs();
    setFinished(run.tour);
    setRun(null);
  }, [run, goTo, update]);
  const back = useCallback(() => run && run.index > 0 && goTo(run.index - 1), [run, goTo]);

  const close = useCallback(() => setExiting(true), []);
  const leave = useCallback(
    (how: "pause" | "skip" | "continue") => {
      setExiting(false);
      if (!run || how === "continue") return;
      update((s) => (how === "skip" ? skipTour(s, run.tour.id) : pauseTour(s, run.tour.id)), run.tour.id);
      track(how === "skip" ? "tour_skipped" : "tour_abandoned", run.tour, run.index);
      resolving.current++;
      closeDialogs();
      setRun(null);
    },
    [run, update],
  );

  const value = useMemo<TourContextValue>(
    () => ({
      state, catalog, loadCatalog, start, running: Boolean(run), loaded,
      dismissWelcome: (v) => update((s) => ({ ...s, welcome: v })),
      markPrompted: (route) => update((s) => (s.prompted.includes(route) ? s : { ...s, prompted: [...s.prompted, route] })),
    }),
    [state, catalog, loadCatalog, start, run, update, loaded],
  );

  const text = useCallback((s: string) => brandText(s, identity.orgName), [identity.orgName]);
  const step = run?.steps[run.index];

  return (
    <Ctx.Provider value={value}>
      {children}
      {run && step && ready && !exiting && (
        <TourOverlay
          tour={run.tour}
          step={step}
          index={run.index}
          total={run.steps.length}
          minutesLeft={minutesLeft(run.tour, run.index, run.steps.length)}
          target={target}
          helpBase={base}
          videoUrl={run.tour.video ? catalog?.videos[run.tour.video] : undefined}
          text={text}
          onBack={back}
          onNext={next}
          onClose={close}
          onLeave={() => leave("pause")}
        />
      )}
      {run && exiting && <TourExitPrompt onChoose={leave} />}
      {finished && (
        <TourCompletion
          tour={finished}
          nextTour={catalog?.tours.find((t) => t.id === finished.next && canTakeTour(t, access))}
          helpBase={base}
          videoUrl={finished.video ? catalog?.videos[finished.video] : undefined}
          rated={Boolean(state.tours[finished.id]?.feedback)}
          onRate={(fb) => update((s) => rateTour(s, finished.id, fb), finished.id)}
          onNext={(id) => (setFinished(null), void start(id))}
          onClose={() => setFinished(null)}
        />
      )}
    </Ctx.Provider>
  );
}
