"use client";

import { BookOpen, CheckCircle2, PlayCircle, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import type { TourDef } from "../types";

/** Painel pequeno e acessível (foco inicial, Esc, Tab preso) usado nas perguntas do tour. */
function Panel({ label, onEscape, children }: { label: string; onEscape: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button, a[href], textarea")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onEscape());
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onEscape]);
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), textarea")];
    const [first, last] = [items[0], items[items.length - 1]];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  return createPortal(
    <div className="tour-root pointer-events-auto fixed inset-0 z-[70] grid place-items-center p-4" data-tour-overlay>
      <div aria-hidden className="tour-dim fixed inset-0" />
      <div ref={ref} role="alertdialog" aria-modal="true" aria-label={label} onKeyDown={trap} className="tour-pop relative w-full max-w-md rounded-2xl border border-line-strong bg-panel p-6 shadow-2xl">
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function TourExitPrompt({ onChoose }: { onChoose: (how: "pause" | "skip" | "continue") => void }) {
  return (
    <Panel label="Quer continuar depois?" onEscape={() => onChoose("continue")}>
      <h2 className="font-display text-lg font-semibold text-white">Quer continuar depois?</h2>
      <p className="mt-2 text-sm text-zinc-300">Seu progresso fica salvo. Você pode retomar deste ponto pelo botão Ajuda ou pela Central de Ajuda.</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => onChoose("skip")}>
          Não mostrar mais
        </Button>
        <Button variant="outline" onClick={() => onChoose("pause")}>
          Salvar e sair
        </Button>
        <Button onClick={() => onChoose("continue")}>Continuar agora</Button>
      </div>
    </Panel>
  );
}

export function TourCompletion({
  tour, nextTour, helpBase, videoUrl, rated, onRate, onNext, onClose,
}: {
  tour: TourDef;
  nextTour?: TourDef;
  helpBase: string;
  videoUrl?: string;
  rated: boolean;
  onRate: (fb: { helpful: boolean; comment: string }) => void;
  onNext: (id: string) => void;
  onClose: () => void;
}) {
  const [answer, setAnswer] = useState<boolean | null>(rated ? true : null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(rated);
  return (
    <Panel label={`${tour.title} concluído`} onEscape={onClose}>
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
        <CheckCircle2 className="size-4" /> Treinamento concluído
      </p>
      <h2 className="mt-1 font-display text-lg font-semibold text-white">{tour.title}</h2>
      {tour.learn.length > 0 && (
        <>
          <p className="mt-3 text-sm text-zinc-300">Agora você já sabe:</p>
          <ul className="mt-2 space-y-1.5">
            {tour.learn.map((l) => (
              <li key={l} className="flex gap-2 text-sm text-zinc-200">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> {l}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
        {tour.article && (
          <Link href={`${helpBase}/artigo/${tour.article}`} onClick={onClose} className="inline-flex items-center gap-1.5 text-brand-soft hover:underline">
            <BookOpen className="size-3.5" /> Ver guia completo
          </Link>
        )}
        {videoUrl && (
          <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-brand-soft hover:underline">
            <PlayCircle className="size-3.5" /> Assistir vídeo
          </a>
        )}
        <Link href={`${helpBase}/faq`} onClick={onClose} className="text-brand-soft hover:underline">
          Dúvidas comuns
        </Link>
      </div>

      <div className="mt-5 rounded-xl border border-line p-3">
        {sent ? (
          <p className="text-xs text-muted">Obrigado pela avaliação. Ela ajuda a melhorar este treinamento.</p>
        ) : (
          <>
            <p className="text-sm text-zinc-200">Este treinamento ajudou?</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant={answer === true ? "primary" : "outline"} onClick={() => (onRate({ helpful: true, comment: "" }), setSent(true))}>
                <ThumbsUp /> Sim
              </Button>
              <Button size="sm" variant={answer === false ? "primary" : "outline"} onClick={() => setAnswer(false)}>
                <ThumbsDown /> Não
              </Button>
            </div>
            {answer === false && (
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onRate({ helpful: false, comment: comment.trim() });
                  setSent(true);
                }}
              >
                <label htmlFor="tour-feedback" className="text-xs text-muted">
                  O que ficou confuso? (opcional)
                </label>
                <Textarea id="tour-feedback" rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
                <Button size="sm" type="submit">
                  Enviar avaliação
                </Button>
              </form>
            )}
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
        {nextTour && <Button onClick={() => onNext(nextTour.id)}>Próximo: {nextTour.title}</Button>}
      </div>
    </Panel>
  );
}
