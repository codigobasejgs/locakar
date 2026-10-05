"use client";

import { BookOpen, ChevronLeft, ChevronRight, PlayCircle, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import type { TourDef, TourStep } from "../types";

export interface OverlayProps {
  tour: TourDef;
  step: TourStep;
  index: number;
  total: number;
  minutesLeft: number;
  /** Elemento destacado; null = explicação centralizada. */
  target: Element | null;
  helpBase: string;
  videoUrl?: string;
  text: (s: string) => string;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
  /** Sair do tour para abrir um guia: pausa sem perguntar (o progresso fica salvo). */
  onLeave: () => void;
}

type Box = { top: number; left: number; width: number; height: number };
const PAD = 8;
const GAP = 14;
const MARGIN = 12;

const boxOf = (el: Element | null): Box | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 } : null;
};

/** Melhor lado para o balão: o pedido se couber, senão o que tiver mais espaço. */
function place(box: Box, pop: { w: number; h: number }, wanted: TourStep["placement"]) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const space = { bottom: vh - (box.top + box.height), top: box.top, right: vw - (box.left + box.width), left: box.left };
  const fits = { bottom: space.bottom >= pop.h + GAP, top: space.top >= pop.h + GAP, right: space.right >= pop.w + GAP, left: space.left >= pop.w + GAP };
  const side = wanted && wanted !== "auto" && fits[wanted] ? wanted : (["bottom", "top", "right", "left"] as const).find((s) => fits[s]) ?? "bottom";
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - pop.w - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - pop.h - MARGIN);
  const cx = box.left + box.width / 2 - pop.w / 2;
  const cy = box.top + box.height / 2 - pop.h / 2;
  if (side === "bottom") return { left: clampX(cx), top: clampY(box.top + box.height + GAP) };
  if (side === "top") return { left: clampX(cx), top: clampY(box.top - pop.h - GAP) };
  if (side === "right") return { left: clampX(box.left + box.width + GAP), top: clampY(cy) };
  return { left: clampX(box.left - pop.w - GAP), top: clampY(cy) };
}

/**
 * Camada do tour sobre a interface REAL: escurece a tela, recorta o elemento destacado e mostra o balão.
 * Não altera a página: só lê a posição do alvo. Em telas estreitas o balão vira uma folha inferior.
 */
export function TourOverlay(props: OverlayProps) {
  const { tour, step, index, total, minutesLeft, target, helpBase, videoUrl, text, onBack, onNext, onClose, onLeave } = props;
  const [box, setBox] = useState<Box | null>(() => boxOf(target));
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Já nasce no formato certo: sem um quadro intermediário fora da tela no celular.
  const [sheet, setSheet] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const pop = useRef<HTMLDivElement>(null);
  const last = index === total - 1;

  const measure = useCallback(() => {
    const b = boxOf(target);
    setBox(b);
    const narrow = window.innerWidth < 640;
    setSheet(narrow);
    const el = pop.current;
    if (!el || narrow || !b) return setPos(null);
    setPos(place(b, { w: el.offsetWidth, h: el.offsetHeight }, step.placement));
  }, [target, step.placement]);

  // Medir a posição real do alvo exige ler o layout depois de renderizar: é sincronização com o DOM.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    // Reposiciona em rolagem, redimensionamento e mudanças de layout (ex.: imagens carregando).
    const ro = new ResizeObserver(measure);
    if (target) ro.observe(target);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, target]);

  // Foco no balão a cada passo (leitores de tela anunciam o título) e teclado: Esc, ←, →.
  useEffect(() => {
    pop.current?.focus({ preventScroll: true });
  }, [step.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.isTrusted) return;
      // Captura antes do formulário aberto: Esc fecha o tour, não o formulário embaixo dele.
      if (e.key === "Escape") return void (e.stopPropagation(), onClose());
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if (typing) return;
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft" && index > 0) onBack();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onBack, onNext, onClose, index]);

  // Mantém o Tab dentro do balão enquanto o tour está aberto.
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !pop.current) return;
    const items = [...pop.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
    if (!items.length) return;
    const [first, end] = [items[0], items[items.length - 1]];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      end.focus();
    } else if (!e.shiftKey && document.activeElement === end) {
      e.preventDefault();
      first.focus();
    }
  };

  if (typeof document === "undefined") return null;
  const centered = !box;
  const style: React.CSSProperties = sheet
    ? {}
    : centered
      ? { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
      : pos
        ? { top: pos.top, left: pos.left }
        : { top: -9999, left: -9999 };

  return createPortal(
    // pointer-events-auto: com um formulário aberto, o Radix desliga cliques fora dele; o tour precisa continuar clicável.
    <div className="tour-root pointer-events-auto fixed inset-0 z-[60]" data-tour-overlay>
      {/* Clique fora não fecha: evita perder o progresso sem querer. O fundo bloqueia cliques na página. */}
      {box ? (
        <div
          aria-hidden
          className="tour-spot pointer-events-none fixed rounded-xl"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      ) : (
        <div aria-hidden className="tour-dim fixed inset-0" />
      )}
      <div aria-hidden className="fixed inset-0" />
      <div
        ref={pop}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-content"
        tabIndex={-1}
        onKeyDown={trap}
        className={
          sheet
            ? "tour-pop fixed inset-x-0 bottom-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-line-strong bg-panel p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none"
            : "tour-pop fixed w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-line-strong bg-panel p-5 shadow-2xl outline-none"
        }
        style={style}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-soft">
            {step.chapter ? `${step.chapter} · ` : ""}Passo {index + 1} de {total}
          </p>
          <button type="button" onClick={onClose} aria-label="Fechar treinamento" className="-m-1 grid size-7 place-items-center rounded-lg text-muted hover:bg-white/[0.06] hover:text-white">
            <X className="size-4" />
          </button>
        </div>
        <h2 id="tour-title" className="mt-1 font-display text-base font-semibold text-white">
          {text(step.title)}
        </h2>
        <p id="tour-content" className="mt-2 text-sm leading-relaxed text-zinc-300">
          {text(step.content)}
        </p>
        {(step.article || step.link || (last && (tour.article || videoUrl))) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {step.article && (
              <Link href={`${helpBase}/artigo/${step.article}`} onClick={onLeave} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-soft hover:underline">
                <BookOpen className="size-3.5" /> Saiba mais
              </Link>
            )}
            {step.link && (
              <Link href={step.link.href} onClick={onLeave} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-soft hover:underline">
                {step.link.label}
              </Link>
            )}
            {last && videoUrl && (
              <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-soft hover:underline">
                <PlayCircle className="size-3.5" /> Assistir vídeo
              </a>
            )}
          </div>
        )}
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full bg-gradient-to-r from-magenta to-brand" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} disabled={index === 0}>
            <ChevronLeft /> Voltar
          </Button>
          <span className="text-[11px] text-muted" aria-live="polite">
            {index + 1} de {total} · ~{minutesLeft} min
          </span>
          <Button size="sm" onClick={onNext}>
            {last ? "Concluir" : "Próximo"} {!last && <ChevronRight />}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
