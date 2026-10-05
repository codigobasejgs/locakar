"use client";

import { AlertTriangle, CheckCircle2, LifeBuoy, Lightbulb, MessageCircle, Printer, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useHelp } from "./context";
import { toggleItem } from "../progress";
import { trackHelp } from "../track";
import type { HelpArticle, HelpMarker, HelpStep } from "../types";

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

export function StepItem({ step, index, gallery }: { step: HelpStep; index: number; gallery?: { src: string; caption: string; markers?: HelpMarker[] }[] }) {
  return (
    <li id={`passo-${index + 1}`} data-step={index + 1} className="relative scroll-mt-24 pl-8 break-inside-avoid">
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
          <ScreenshotView src={step.image} caption={step.caption ?? step.title} markers={step.markers} gallery={gallery} />
        </div>
      )}
    </li>
  );
}

/** Imagem + marcadores numerados. O wrapper inline-block tem o tamanho exato da imagem, então % bate com o pixel. */
function Annotated({ src, alt, markers, className, lazy }: { src: string; alt: string; markers?: HelpMarker[]; className: string; lazy?: boolean }) {
  return (
    <span className="relative inline-block max-w-full align-top">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className} loading={lazy ? "lazy" : undefined} draggable={false} />
      {markers?.map((m, i) => (
        <span
          key={i}
          aria-hidden
          title={m.label}
          className="help-marker absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-magenta text-[11px] font-bold text-white shadow-lg ring-2 ring-white"
          style={{ left: `${m.x}%`, top: `${m.y}%` }}
        >
          {i + 1}
        </span>
      ))}
    </span>
  );
}

function MarkerLegend({ markers }: { markers?: HelpMarker[] }) {
  if (!markers?.length) return null;
  return (
    <ol className="mt-2 space-y-1 text-xs text-zinc-300">
      {markers.map((m, i) => (
        <li key={i} className="flex gap-2">
          <span className="help-marker grid size-4 shrink-0 place-items-center rounded-full bg-magenta text-[10px] font-bold text-white">{i + 1}</span>
          {m.label}
        </li>
      ))}
    </ol>
  );
}

export function ScreenshotView({ src, caption, markers, gallery }: { src: string; caption: string; markers?: HelpMarker[]; gallery?: { src: string; caption: string; markers?: HelpMarker[] }[] }) {
  const [open, setOpen] = useState(false);
  const list = gallery?.length ? gallery : [{ src, caption, markers }];
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const current = list[index] ?? list[0];
  const go = (d: number) => {
    setZoom(null);
    setIndex((i) => (i + d + list.length) % list.length);
  };
  const show = () => {
    setIndex(Math.max(0, list.findIndex((g) => g.src === src)));
    setZoom(null);
    setOpen(true);
  };
  return (
    <>
      <figure className="group relative overflow-hidden rounded-xl border border-line bg-surface p-2 transition-colors hover:border-line-strong">
        <button type="button" onClick={show} className="block w-full text-center" aria-label={`Ampliar imagem: ${caption}`}>
          <Annotated src={src} alt={caption} markers={markers} lazy className="max-h-80 w-auto max-w-full rounded-lg object-contain bg-black/40" />
          <figcaption className="mt-2 text-center text-xs text-muted group-hover:text-zinc-300">
            🔍 {caption} <span className="no-print">(toque para ampliar)</span>
          </figcaption>
        </button>
        <MarkerLegend markers={markers} />
      </figure>

      <Dialog open={open} onOpenChange={setOpen} title={current.caption} description={list.length > 1 ? `Imagem ${index + 1} de ${list.length}` : undefined} size="lg">
        <div
          className="flex flex-col items-center"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
        >
          <div className="max-h-[70vh] w-full overflow-auto rounded-xl bg-black/40 text-center">
            <button
              type="button"
              className={zoom ? "cursor-zoom-out" : "cursor-zoom-in"}
              aria-label={zoom ? "Reduzir imagem" : "Ampliar ponto da imagem"}
              onClick={(e) => {
                if (zoom) return setZoom(null);
                const r = e.currentTarget.getBoundingClientRect();
                setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
              }}
            >
              <span className="inline-block transition-transform" style={zoom ? { transform: "scale(2.2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}>
                <Annotated src={current.src} alt={current.caption} markers={current.markers} className="max-h-[70vh] w-auto max-w-full object-contain" />
              </span>
            </button>
          </div>
          <MarkerLegend markers={current.markers} />
          <div className="mt-3 flex w-full items-center justify-between gap-2 text-xs text-muted">
            {list.length > 1 ? <Button size="sm" variant="ghost" onClick={() => go(-1)}>← Anterior</Button> : <span />}
            <span>Clique na imagem para ampliar um ponto.</span>
            {list.length > 1 ? <Button size="sm" variant="ghost" onClick={() => go(1)}>Próxima →</Button> : <span />}
          </div>
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

/** Primeira rota que dá para abrir direto (rotas com [id]/[token] dependem de um registro específico). */
export const openableRoute = (article: HelpArticle) => article.routes.find((r) => !r.includes("["));

export function SupportCard({ compact }: { compact?: boolean }) {
  const { support } = useHelp();
  const href = support.whatsapp ? `https://wa.me/${support.whatsapp}?text=${encodeURIComponent("Olá! Preciso de ajuda com o sistema.")}` : null;
  return (
    <section aria-label="Ainda precisa de ajuda?" className={`no-print rounded-2xl border border-line bg-surface ${compact ? "p-4" : "p-6"} flex flex-wrap items-center justify-between gap-4`}>
      <div>
        <h2 className="font-semibold text-white flex items-center gap-2">
          <LifeBuoy className="size-4 text-brand-soft" /> Ainda precisa de ajuda?
        </h2>
        <p className="mt-1 text-xs text-muted">
          {support.note || (href ? "Fale com quem pode resolver pelo WhatsApp. Conte o que tentou fazer e em qual tela." : "O canal de atendimento ainda não foi configurado.")}
        </p>
      </div>
      {href && (
        <Button asChild size="sm" variant="outline">
          <a href={href} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" /> {support.label}
          </a>
        </Button>
      )}
    </section>
  );
}

export function ArticleActions({ article }: { article: HelpArticle }) {
  const { access, progress, setProgress } = useHelp();
  const [feedbackSent, setFeedbackSent] = useState<"yes" | "no" | null>(null);
  const [comment, setComment] = useState("");
  const isFav = progress.favorites.includes(article.slug);
  const isDone = progress.completed.includes(article.slug);

  const toggleFav = () => setProgress((p) => ({ ...p, favorites: toggleItem(p.favorites, article.slug) }));
  const toggleDone = () => setProgress((p) => ({ ...p, completed: toggleItem(p.completed, article.slug) }));

  const sendFeedback = (helpful: boolean) => {
    setProgress((p) => ({ ...p, feedback: { ...p.feedback, [article.slug]: { helpful, comment: comment.trim() } } }));
    trackHelp(access.audience, { kind: "feedback", article: article.slug, helpful, comment: comment.trim() });
    setFeedbackSent(helpful ? "yes" : "no");
  };
  const route = openableRoute(article);

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

        {/* Locatário lê a ajuda fora do app: o link só leva ao app, que pede login. A rota continua protegida. */}
        {route && (
          <Button asChild size="sm">
            <Link href={route}>{access.audience === "tenant" ? "Abrir o aplicativo ↗" : "Ir para a tela ↗"}</Link>
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 text-xs">
        <p className="font-semibold text-white">Este tutorial resolveu sua dúvida?</p>
        {feedbackSent ? (
          <p className="mt-1 text-emerald-400">Obrigado pelo seu retorno! Ele ajuda a melhorar os tutoriais.</p>
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
