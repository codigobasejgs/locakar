"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { articles, categoryName } from "@/help";
import { canReadArticle, featureAvailable } from "@/help/access";
import { useHelp } from "@/help/components/context";
import { searchArticles } from "@/help/search";

/** Ctrl/Cmd+K em qualquer tela do painel: pesquisa a ajuda sem sair da tela. Não há outra paleta no projeto. */
export function HelpPalette() {
  const { access, base } = useHelp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = useMemo(() => articles.filter((a) => canReadArticle(a, access) && featureAvailable(a, access)), [access]);
  const results = useMemo(() => (q.trim() ? searchArticles(visible, q).slice(0, 8).map((r) => r.article) : visible.slice(0, 6)), [visible, q]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setActive(0); }} title="Pesquisar na ajuda" description="Digite sua dúvida. Enter abre o tutorial." size="md">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            ref={input}
            autoFocus
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0))); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter") {
                e.preventDefault();
                const a = results[active];
                go(a ? `${base}/artigo/${a.slug}` : base);
              }
            }}
            placeholder="Ex.: como aprovar comprovante PIX"
            aria-label="Pesquisar na ajuda"
            role="combobox"
            aria-expanded
            aria-controls="help-palette-list"
            aria-activedescendant={results[active] ? `hp-${results[active].slug}` : undefined}
            className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-9 pr-3 text-sm text-white outline-none focus:border-brand-soft"
          />
        </div>
        <ul id="help-palette-list" role="listbox" className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {results.map((a, i) => (
            <li
              key={a.slug}
              id={`hp-${a.slug}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(`${base}/artigo/${a.slug}`)}
              className={`flex cursor-pointer items-center justify-between gap-3 p-3 text-xs ${i === active ? "bg-white/[0.06]" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{a.title}</p>
                <p className="truncate text-[11px] text-muted">{categoryName(a.category)} · {a.minutes} min</p>
              </div>
              {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted" />}
            </li>
          ))}
          {!results.length && (
            <li className="p-4 text-center text-xs text-muted">
              Nada encontrado. <button type="button" className="text-brand-soft hover:underline" onClick={() => go(base)}>Abrir a Central de Ajuda</button>
            </li>
          )}
        </ul>
      </div>
    </Dialog>
  );
}
