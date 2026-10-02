"use client";

import { AlertTriangle, CheckCircle2, Lightbulb, Printer, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useHelp } from "./context";
import { toggleItem } from "../progress";
import type { HelpArticle, HelpStep } from "../types";

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Navegação da Ajuda" className="no-print mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-zinc-600">/</span>}
          {it.href ? <Link href={it.href} className="hover:text-white transition-colors">{it.label}</Link> : <span className="text-zinc-200 font-medium">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function StepItem({ step, index }: { step: HelpStep; index: number }) {
  return (
    <li className="relative pl-8">
      <span className="absolute left-0 top-0.5 grid size-6 place-items-center rounded-full bg-magenta/20 text-xs font-bold text-brand-soft ring-1 ring-magenta/40">
        {index + 1}
      </span>
      <h3 className="font-display text-sm font-semibold text-white">{step.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-zinc-300">{step.text}</p>
      {step.fields && step.fields.length > 0 && (
        <dl className="mt-3 grid gap-2.5 rounded-xl border border-line bg-surface p-3 text-xs sm:grid-cols-2">
          {step.fields.map((f) => (
            <div key={f.name}>
              <dt className="font-semibold text-white">
                {f.name} {f.required && <span className="text-brand-soft" title="Obrigatório">*</span>}
              </dt>
              <dd className="mt-0.5 text-muted">{f.description}</dd>
              {f.example && <dd className="mt-0.5 text-[11px] text-zinc-500">Ex.: {f.example}</dd>}
            </div>
          ))}
        </dl>
      )}
      {step.image && (
        <div className="mt-3">
          <ScreenshotView src={step.image} caption={step.caption ?? step.title} />
        </div>
      )}
    </li>
  );
}

export function ScreenshotView({ src, caption }: { src: string; caption: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <figure className="group relative overflow-hidden rounded-xl border border-line bg-surface p-2 transition-colors hover:border-line-strong">
        <button type="button" onClick={() => setOpen(true)} className="block w-full text-left" aria-label={`Ampliar imagem: ${caption}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={caption} className="max-h-80 w-full rounded-lg object-contain bg-black/40" loading="lazy" />
          <figcaption className="mt-2 text-center text-xs text-muted group-hover:text-zinc-300">
            🔍 {caption} (toque para ampliar)
          </figcaption>
        </button>
      </figure>

      <Dialog open={open} onOpenChange={setOpen} title={caption} size="lg">
        <div className="flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={caption} className="max-h-[75vh] w-auto rounded-xl object-contain" />
          <p className="mt-3 text-xs text-muted">{caption}</p>
        </div>
      </Dialog>
    </>
  );
}

export function NoticeBox({ type, title, text }: { type: "tip" | "warning"; title: string; text: string }) {
  const isTip = type === "tip";
  return (
    <aside className={`flex gap-3 rounded-xl border p-4 text-xs ${isTip ? "border-brand/40 bg-brand/10 text-zinc-200" : "border-amber-400/40 bg-amber-400/10 text-amber-200"}`} aria-label={title}>
      {isTip ? <Lightbulb className="size-4 shrink-0 text-brand-soft mt-0.5" /> : <AlertTriangle className="size-4 shrink-0 text-amber-300 mt-0.5" />}
      <div>
        <p className="font-semibold text-white">{title}</p>
        <p className="mt-0.5 leading-relaxed">{text}</p>
      </div>
    </aside>
  );
}

export function ArticleActions({ article }: { article: HelpArticle }) {
  const { progress, setProgress } = useHelp();
  const [feedbackSent, setFeedbackSent] = useState<"yes" | "no" | null>(null);
  const [comment, setComment] = useState("");
  const isFav = progress.favorites.includes(article.slug);
  const isDone = progress.completed.includes(article.slug);

  const toggleFav = () => setProgress((p) => ({ ...p, favorites: toggleItem(p.favorites, article.slug) }));
  const toggleDone = () => setProgress((p) => ({ ...p, completed: toggleItem(p.completed, article.slug) }));

  const sendFeedback = (helpful: boolean) => {
    setProgress((p) => ({ ...p, feedback: { ...p.feedback, [article.slug]: { helpful, comment: comment.trim() } } }));
    setFeedbackSent(helpful ? "yes" : "no");
  };

  return (
    <footer className="no-print mt-10 space-y-6 border-t border-line pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant={isDone ? "primary" : "outline"} size="sm" onClick={toggleDone}>
            <CheckCircle2 className="size-4" /> {isDone ? "Concluído ✓" : "Marcar como concluído"}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleFav} aria-label={isFav ? "Remover dos favoritos" : "Salvar artigo nos favoritos"}>
            <Star className={`size-4 ${isFav ? "fill-amber-400 text-amber-400" : "text-muted"}`} /> {isFav ? "Salvo" : "Favoritar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Imprimir
          </Button>
        </div>

        {article.routes[0] && (
          <Button asChild size="sm">
            <Link href={article.routes[0]}>Ir para a tela ↗</Link>
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 text-xs">
        <p className="font-semibold text-white">Este tutorial resolveu sua dúvida?</p>
        {feedbackSent ? (
          <p className="mt-1 text-emerald-400">Obrigado pelo seu retorno! Sua avaliação fica salva neste dispositivo.</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => sendFeedback(true)}>
              <ThumbsUp className="size-3.5" /> Sim, ajudou
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFeedbackSent("no")}>
              <ThumbsDown className="size-3.5" /> Não resolveu
            </Button>
          </div>
        )}

        {feedbackSent === "no" && !progress.feedback[article.slug] && (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="O que faltou ou ficou confuso neste tutorial?"
              className="w-full rounded-lg border border-line bg-panel p-2 text-xs text-white outline-none focus:border-line-strong"
            />
            <Button size="sm" onClick={() => sendFeedback(false)}>Enviar retorno</Button>
          </div>
        )}
      </div>
    </footer>
  );
}
