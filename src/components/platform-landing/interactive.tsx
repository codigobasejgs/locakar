"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track, type TrackEvent } from "@/lib/track";
import { cn } from "@/lib/utils";
import { NAV, PLATFORM } from "./content";

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

export function BrandLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src="/brand/frotaeasy/logo-horizontal-dark.webp" alt={`${PLATFORM.name} — ${PLATFORM.slogan}`} width={820} height={217} priority={priority} className={cn("h-auto", className)} />;
}

/** Cabeçalho fixo em vidro. Âncoras (#) funcionam na própria landing; nas páginas legais voltam para "/". */
export function PlatformHeader({ home = "/", onLanding = false }: { home?: string; onLanding?: boolean }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  // Na própria landing a âncora rola a página; nas demais (termos, demo) leva para a landing na seção.
  const anchor = (h: string) => (onLanding ? h : `${home === "/plataforma" ? "/" : home}${h}`);

  return (
    <header className={cn("sticky top-0 z-50 transition-colors", scrolled ? "fe-glass" : "border-b border-transparent")} style={{ top: "env(safe-area-inset-top, 0px)" }}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:h-[72px] sm:px-6">
        <Link href={home} className="shrink-0 rounded-lg" aria-label={`${PLATFORM.name} — início`}>
          <BrandLogo priority className="w-[132px] sm:w-[150px]" />
        </Link>

        <nav aria-label="Seções" className="ml-6 hidden items-center gap-1 xl:flex">
          {NAV.map((n) => (
            <a key={n.href} href={anchor(n.href)} className="fe-text-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors hover:text-white">
              {n.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href={PLATFORM.login} className="fe-btn fe-btn-ghost hidden !min-h-11 !px-5 !text-sm md:inline-flex">
            Entrar no Sistema
          </Link>
          <TrackedLink href={PLATFORM.signup} event="hero_cta_clicked" params={{ place: "header" }} className="fe-btn fe-btn-primary hidden !min-h-11 !px-5 !text-sm sm:inline-flex">
            Testar Frota Easy
          </TrackedLink>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="fe-btn-ghost inline-flex size-11 items-center justify-center rounded-full border xl:hidden"
            aria-expanded={open}
            aria-controls="fe-menu"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <nav id="fe-menu" aria-label="Seções" className={cn("fe-glass border-t px-4 pb-5 xl:hidden", !open && "hidden")}>
        <ul className="mx-auto grid max-w-7xl gap-1 pt-2">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={anchor(n.href)} onClick={() => setOpen(false)} className="fe-text-2 flex min-h-11 items-center rounded-lg px-2 font-medium hover:text-white">
                {n.label}
              </a>
            </li>
          ))}
          <li className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link href={PLATFORM.login} className="fe-btn fe-btn-ghost">Entrar no Sistema</Link>
            <TrackedLink href={PLATFORM.signup} event="hero_cta_clicked" params={{ place: "menu" }} className="fe-btn fe-btn-primary">Testar Frota Easy</TrackedLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}

const SHOWCASE = [
  { id: "dash", label: "Dashboard", img: "/plataforma/dashboard-dark.webp", w: 1600, h: 1000, alt: "Dashboard executivo com frota disponível, alugados, faturamento, atrasos e lucro líquido", caption: "Indicadores da operação em tempo real: ocupação, faturamento, atrasos e lucro líquido por veículo." },
  { id: "fleet", label: "Frota + FIPE", img: "/plataforma/vehicles-dark.webp", w: 1600, h: 1000, alt: "Cadastro da frota com placas, status e valor FIPE de cada veículo", caption: "Cadastro pelo CRLV-e com valor FIPE automático, documentos, fotos, hodômetro, IPVA e licenciamento." },
  { id: "rentals", label: "Locações", img: "/plataforma/rentals-dark.webp", w: 1600, h: 1000, alt: "Lista de locações com status, períodos e parcelas", caption: "Locações com parcelas, multa e juros automáticos, contrato e vistoria em um só lugar." },
  { id: "finance", label: "Financeiro", img: "/plataforma/finance-dark.webp", w: 1600, h: 1000, alt: "Financeiro com recebimentos, despesas e resultado", caption: "Recebimentos, despesas e resultado do período, com baixa automática pelos meios de pagamento." },
  { id: "reports", label: "Relatórios", img: "/plataforma/reports-dark.webp", w: 1600, h: 1000, alt: "Relatórios gerenciais com gráficos por período", caption: "Relatórios por período, veículo e cliente para decidir com números." },
] as const;

/** Vitrine do produto com abas (telas reais do painel, dados fictícios). */
export function ProductShowcase() {
  const [active, setActive] = useState<(typeof SHOWCASE)[number]["id"]>("dash");
  const current = SHOWCASE.find((s) => s.id === active)!;
  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label="Telas do sistema" className="mx-auto flex max-w-full flex-wrap justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1.5">
        {SHOWCASE.map((s) => (
          <button key={s.id} id={`fe-tab-${s.id}`} type="button" role="tab" aria-selected={active === s.id} aria-controls="fe-showcase" onClick={() => setActive(s.id)} className="fe-tab">
            {s.label}
          </button>
        ))}
      </div>
      <div id="fe-showcase" role="tabpanel" aria-labelledby={`fe-tab-${current.id}`} className="fe-window">
        <div className="fe-window-bar" aria-hidden="true">
          <span /><span /><span />
          <p className="fe-muted ml-3 truncate text-[11px]">app.frotaeasy.com.br/admin</p>
        </div>
        {SHOWCASE.map((s) => (
          <Image key={s.id} src={s.img} alt={s.alt} width={s.w} height={s.h} sizes="(min-width: 1280px) 1100px, 100vw" loading={s.id === "dash" ? "eager" : "lazy"} className={cn("block h-auto w-full", s.id !== active && "hidden")} />
        ))}
      </div>
      <p className="fe-text-2 mx-auto max-w-2xl text-center text-sm" aria-live="polite">{current.caption}</p>
    </div>
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
          <button key={b.id} type="button" role="tab" aria-selected={active === b.id} aria-controls="fe-brand-panel" onClick={() => setActive(b.id)} className="fe-tab inline-flex items-center gap-2 border-white/10">
            <span className="size-3 rounded-full" style={{ background: b.color }} aria-hidden="true" />
            {b.name}
          </button>
        ))}
      </div>
      <div id="fe-brand-panel" role="tabpanel" aria-label={`Painel com a marca ${current.name}`} className="fe-window">
        {BRAND_VIEWS.map((b) => (
          <Image key={b.id} src={`/plataforma/${b.img}.webp`} alt={`Painel com logo e cores da locadora fictícia ${b.name}`} width={1200} height={750} sizes="(min-width: 1024px) 760px, 100vw" loading="lazy" className={cn("block h-auto w-full", b.id !== active && "hidden")} />
        ))}
      </div>
      <p className="fe-muted text-center text-xs">Locadoras e logos fictícios, criados só para esta demonstração.</p>
    </div>
  );
}


/* ---------- Contagem regressiva da oferta (prazo real, vem do plano) ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** Contagem até `deadline`. No servidor e antes de hidratar mostra só a data (sem divergência de HTML). */
export function Countdown({ deadline, className }: { deadline: string; className?: string }) {
  const end = Date.parse(deadline);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Primeiro tique já no próximo frame (sem esperar 1 s); intervalo depois.
    const first = requestAnimationFrame(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(t);
    };
  }, []);
  const date = new Date(end).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" });
  const left = now == null ? null : Math.max(0, end - now);
  if (left === 0) return null;
  const parts = left == null ? null : [
    { v: Math.floor(left / 86_400_000), l: "dias" },
    { v: Math.floor(left / 3_600_000) % 24, l: "horas" },
    { v: Math.floor(left / 60_000) % 60, l: "min" },
    { v: Math.floor(left / 1000) % 60, l: "seg" },
  ];
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <p className="fe-muted text-xs font-semibold uppercase tracking-[0.14em]">Oferta termina em {date}</p>
      {parts && (
        // Leitor de tela: só o prazo, sem anunciar cada segundo.
        <div className="flex gap-2" aria-hidden="true">
          {parts.map((p) => (
            <div key={p.l} className="fe-card grid min-w-[64px] place-items-center px-3 py-2">
              <span className="text-2xl font-bold tabular-nums">{pad(p.v)}</span>
              <span className="fe-muted text-[10px] uppercase tracking-wider">{p.l}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Faixa da oferta no topo da página: preço + prazo, leva aos planos. Some quando a oferta acaba. */
export function PromoBar({ label, deadline }: { label: string; deadline: string }) {
  const [left, setLeft] = useState<string | null>(null);
  useEffect(() => {
    const end = Date.parse(deadline);
    const tick = () => {
      const ms = end - Date.now();
      if (ms <= 0) return setLeft("");
      const d = Math.floor(ms / 86_400_000);
      setLeft(d > 0 ? `${d}d ${pad(Math.floor(ms / 3_600_000) % 24)}h ${pad(Math.floor(ms / 60_000) % 60)}min` : `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline]);
  if (left === "") return null;
  return (
    <a href="#planos" onClick={() => track("pricing_viewed", { place: "promo_bar" })} className="relative z-50 block bg-gradient-to-r from-[#7a00ff] to-[#a64dff] px-4 py-2 text-center text-xs font-semibold text-white sm:text-sm">
      {label}
      {left && <span className="ml-2 inline-block rounded-md bg-black/25 px-2 py-0.5 tabular-nums">termina em {left}</span>}
      <span className="ml-2 underline underline-offset-2">Ver planos</span>
    </a>
  );
}

/* ---------- Relógio flutuante da oferta + prova social real ---------- */

const ago = (iso: string, now: number) => {
  const m = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dia${h >= 48 ? "s" : ""}`;
};

/**
 * Canto inferior: relógio até o fim real da oferta (some quando acaba ou ao fechar) e, de tempos em tempos,
 * um aviso de cadastro real de locadora (cidade + quando; sem nome). Pausa com prefers-reduced-motion.
 */
export function OfferWidget({ deadline, price, signups }: { deadline: string | null; price: string; signups: { city: string | null; at: string }[] }) {
  const [now, setNow] = useState<number | null>(null);
  const [closed, setClosed] = useState(false);
  const [toast, setToast] = useState<number | null>(null);
  useEffect(() => {
    const first = requestAnimationFrame(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (!signups.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = 0;
    let hide: ReturnType<typeof setTimeout>;
    const show = () => {
      setToast(i++ % signups.length);
      hide = setTimeout(() => setToast(null), 6000);
    };
    const start = setTimeout(show, 12_000);
    const loop = setInterval(show, 35_000);
    return () => {
      clearTimeout(start);
      clearTimeout(hide);
      clearInterval(loop);
    };
  }, [signups.length]);

  const left = deadline && now != null ? Date.parse(deadline) - now : null;
  const showClock = !closed && left != null && left > 0;
  const s = toast != null && now != null ? signups[toast] : null;
  if (!showClock && !s) return null;
  const d = left ? Math.floor(left / 86_400_000) : 0;
  const clock = left ? `${d > 0 ? `${d}d ` : ""}${pad(Math.floor(left / 3_600_000) % 24)}:${pad(Math.floor(left / 60_000) % 60)}:${pad(Math.floor(left / 1000) % 60)}` : "";

  return (
    <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2 sm:left-6">
      {s && (
        <p role="status" className="fe-card pointer-events-auto flex items-center gap-3 bg-[#14141c]/95 px-4 py-3 text-sm shadow-2xl backdrop-blur-xl">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--fe-ok)]/15 text-[var(--fe-ok)]" aria-hidden="true">✓</span>
          <span>
            <span className="block font-semibold">Nova locadora no {PLATFORM.name}</span>
            <span className="fe-muted text-xs">{s.city ? `${s.city} · ` : ""}{ago(s.at, now!)}</span>
          </span>
        </p>
      )}
      {showClock && (
        <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-[rgb(166_77_255/0.5)] bg-[#14141c]/95 py-1.5 pl-3 pr-1.5 shadow-[0_10px_40px_-10px_rgb(122_0_255/0.8)] backdrop-blur-xl">
          <a href="#planos" onClick={() => track("pricing_viewed", { place: "offer_clock" })} className="flex items-center gap-2 py-1 text-xs sm:text-sm">
            <span aria-hidden="true">⏱️</span>
            <span>
              <span className="font-semibold">{price}/mês</span>
              <span className="fe-muted"> · termina em </span>
              <span className="font-bold tabular-nums text-[var(--fe-accent-text)]" aria-hidden="true">{clock}</span>
              <span className="sr-only">{new Date(Date.parse(deadline!)).toLocaleDateString("pt-BR")}</span>
            </span>
          </a>
          <button type="button" onClick={() => setClosed(true)} aria-label="Fechar aviso da oferta" className="grid size-9 place-items-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
