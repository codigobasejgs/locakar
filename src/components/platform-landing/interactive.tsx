"use client";

import { Menu, Moon, Sun, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track, type TrackEvent } from "@/lib/track";
import { cn } from "@/lib/utils";
import { NAV, PLATFORM, WA } from "./content";

/** Link com evento de analytics. Externo abre em nova aba. */
export function TrackedLink({
  href,
  event,
  params,
  className,
  children,
  ...rest
}: { href: string; event: TrackEvent; params?: Record<string, string>; className?: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "className" | "children"
>) {
  const external = href.startsWith("http");
  const onClick = () => track(event, params);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className={className} {...rest}>
      {children}
    </Link>
  );
}

/** Dispara um evento uma única vez quando a seção entra na tela. */
export function ViewTracker({ event }: { event: TrackEvent }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        track(event);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [event]);
  return <span ref={ref} aria-hidden="true" />;
}

const THEME_KEY = "plataforma-theme";

function applyTheme(theme: "light" | "dark" | null) {
  const el = document.querySelector<HTMLElement>(".pl");
  if (!el) return;
  if (theme) el.dataset.theme = theme;
  else delete el.dataset.theme;
}

function resolvedTheme(): "light" | "dark" {
  const set = document.querySelector<HTMLElement>(".pl")?.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function PlatformHeader() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {
      /* armazenamento indisponível */
    }
    if (saved === "light" || saved === "dark") applyTheme(saved);
    const id = requestAnimationFrame(() => setTheme(resolvedTheme()));
    return () => cancelAnimationFrame(id);
  }, []);

  const toggle = () => {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* armazenamento indisponível */
    }
  };

  return (
    <header className="pl-glass sticky top-0 z-50 border-x-0 border-t-0" style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/plataforma" className="flex shrink-0 items-center gap-2.5" aria-label={`${PLATFORM.name} — início`}>
          <Image src="/plataforma/mark.svg" alt="" width={32} height={32} className="size-8" />
          <span className="font-display text-[15px] font-semibold tracking-tight">
            LOCAKAR <span className="pl-accent">SaaS</span>
          </span>
        </Link>

        <nav aria-label="Seções" className="ml-4 hidden items-center gap-5 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="pl-text-2 text-sm font-medium hover:text-[var(--pl-accent)]">
              {n.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="pl-btn-ghost inline-flex size-10 items-center justify-center rounded-lg border"
            aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <TrackedLink href={WA.know} event="hero_cta_clicked" params={{ place: "header" }} className="pl-btn pl-btn-primary hidden !min-h-10 sm:inline-flex">
            Quero conhecer
          </TrackedLink>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="pl-btn-ghost inline-flex size-10 items-center justify-center rounded-lg border lg:hidden"
            aria-expanded={open}
            aria-controls="pl-menu"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <nav id="pl-menu" aria-label="Seções" className={cn("border-t pl-line px-4 pb-4 lg:hidden", !open && "hidden")}>
        <ul className="mx-auto grid max-w-6xl gap-1 pt-2">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} onClick={() => setOpen(false)} className="pl-text-2 block rounded-lg px-2 py-2.5 font-medium">
                {n.label}
              </a>
            </li>
          ))}
          <li className="pt-2 sm:hidden">
            <TrackedLink href={WA.know} event="hero_cta_clicked" params={{ place: "menu" }} className="pl-btn pl-btn-primary w-full">
              Quero conhecer o sistema
            </TrackedLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}

const BRAND_VIEWS = [
  { id: "purple", name: "Sua Locadora", color: "#8b008b", img: "brand-purple" },
  { id: "blue", name: "Rota Azul", color: "#1d4ed8", img: "brand-blue" },
  { id: "green", name: "Verde Mobi", color: "#047857", img: "brand-green" },
] as const;

/** Mesma tela do painel em três identidades (logo e cores trocados pela configuração de marca). */
export function BrandSwitcher() {
  const [active, setActive] = useState<(typeof BRAND_VIEWS)[number]["id"]>("purple");
  const current = BRAND_VIEWS.find((b) => b.id === active)!;
  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label="Exemplos de marca" className="flex flex-wrap justify-center gap-2">
        {BRAND_VIEWS.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={active === b.id}
            aria-controls="pl-brand-panel"
            onClick={() => setActive(b.id)}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
              active === b.id ? "pl-line-strong pl-surface pl-text" : "pl-line pl-muted",
            )}
          >
            <span className="size-3 rounded-full" style={{ background: b.color }} aria-hidden="true" />
            {b.name}
          </button>
        ))}
      </div>
      <div id="pl-brand-panel" role="tabpanel" aria-label={`Painel com a marca ${current.name}`} className="relative">
        {BRAND_VIEWS.map((b) => (
          <Image
            key={b.id}
            src={`/plataforma/${b.img}.webp`}
            alt={`Dashboard do painel com logo e cores da locadora fictícia ${b.name}`}
            width={1200}
            height={750}
            sizes="(min-width: 1024px) 960px, 100vw"
            loading="lazy"
            className={cn("pl-shadow h-auto w-full rounded-xl border pl-line", b.id !== active && "hidden")}
          />
        ))}
      </div>
      <p className="pl-muted text-center text-xs">Locadoras e logos fictícios, criados só para esta demonstração.</p>
    </div>
  );
}

/** Comparação lado a lado do tema claro e escuro, arrastando o divisor. */
export function ThemeCompare() {
  const [pos, setPos] = useState(50);
  return (
    <div className="pl-compare grid gap-4">
      <div className="pl-shadow relative overflow-hidden rounded-xl border pl-line">
        <Image src="/plataforma/dashboard-light.webp" alt="Dashboard no tema claro" width={1600} height={1000} sizes="(min-width: 1024px) 960px, 100vw" loading="lazy" className="block h-auto w-full" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          <Image src="/plataforma/dashboard-dark.webp" alt="Dashboard no tema escuro" width={1600} height={1000} sizes="(min-width: 1024px) 960px, 100vw" loading="lazy" className="block h-auto w-full" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--pl-accent)]" style={{ left: `${pos}%` }} aria-hidden="true" />
        <span className="pl-glass pointer-events-none absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold">Claro</span>
        <span className="pl-glass pointer-events-none absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-semibold">Escuro</span>
      </div>
      <label className="pl-muted mx-auto flex w-full max-w-sm items-center gap-3 text-sm">
        <Sun className="size-4 shrink-0" aria-hidden="true" />
        <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="w-full" aria-label="Comparar tema claro e escuro" />
        <Moon className="size-4 shrink-0" aria-hidden="true" />
      </label>
    </div>
  );
}
