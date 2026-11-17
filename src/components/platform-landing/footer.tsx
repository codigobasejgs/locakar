import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PLATFORM, WA } from "./content";
import { BrandLogo, TrackedLink } from "./interactive";

export function PlatformFooter() {
  const year = new Date().getFullYear();
  const cols = [
    {
      title: "Produto",
      links: [
        { href: "/#funcionalidades", label: "Funcionalidades" },
        { href: "/#copiloto", label: "Copiloto WhatsApp" },
        { href: "/#automacoes", label: "Automações" },
        { href: "/#app", label: "App do Locatário" },
        { href: "/#planos", label: "Planos" },
      ],
    },
    {
      title: "Acesso",
      links: [
        { href: PLATFORM.login, label: "Entrar no Sistema" },
        { href: PLATFORM.signup, label: "Criar minha locadora" },
        { href: "/#faq", label: "Perguntas frequentes" },
      ],
    },
    {
      title: "Legal",
      links: [
        { href: "/plataforma/termos", label: "Termos de uso" },
        { href: "/plataforma/privacidade", label: "Privacidade" },
      ],
    },
  ];
  return (
    <footer className="border-t border-white/[0.07] bg-[var(--fe-bg-2)]">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:grid-cols-[1.5fr_repeat(3,1fr)] lg:px-8">
        <div>
          <Link href="/" className="inline-block rounded-lg" aria-label={`${PLATFORM.name} — início`}>
            <BrandLogo className="w-[170px]" />
          </Link>
          <p className="fe-muted mt-5 max-w-xs text-sm leading-relaxed">
            {PLATFORM.name} — {PLATFORM.slogan}. Frota, contratos, cobranças, Copiloto no WhatsApp e app do locatário com a marca da sua locadora.
          </p>
          <p className="fe-text-2 mt-5 text-sm">
            Comercial:{" "}
            <TrackedLink href={WA.know} event="whatsapp_clicked" params={{ place: "footer" }} className="fe-link">
              WhatsApp {PLATFORM.whatsapp.display}
            </TrackedLink>
          </p>
          <p className="fe-muted mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs">
            <ShieldCheck className="size-4 text-[var(--fe-ok)]" aria-hidden="true" /> Dados isolados por locadora · LGPD
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="fe-eyebrow">{c.title}</h2>
            <ul className="mt-5 grid gap-1">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="fe-text-2 inline-flex min-h-9 items-center text-sm hover:text-white">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/[0.07]">
        <p className="fe-muted mx-auto max-w-7xl px-4 py-6 text-xs sm:px-6 lg:px-8">
          © {year} {PLATFORM.name}. Todos os direitos reservados. Telas com dados fictícios de demonstração.
        </p>
      </div>
    </footer>
  );
}
