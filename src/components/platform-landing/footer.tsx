import Image from "next/image";
import Link from "next/link";
import { PLATFORM, WA } from "./content";
import { TrackedLink } from "./interactive";

export function PlatformFooter() {
  const year = new Date().getFullYear();
  const cols = [
    {
      title: "Produto",
      links: [
        { href: "/plataforma#produto", label: "Visão geral" },
        { href: "/plataforma#funcionalidades", label: "Funcionalidades" },
        { href: "/plataforma#app", label: "App do locatário" },
        { href: "/plataforma#planos", label: "Planos" },
      ],
    },
    {
      title: "Plataforma",
      links: [
        { href: "/plataforma#integracoes", label: "Integrações" },
        { href: "/plataforma#seguranca", label: "Segurança" },
        { href: "/plataforma#faq", label: "Perguntas frequentes" },
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
    <footer className="pl-surface border-t pl-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link href="/plataforma" className="inline-flex items-center gap-2.5">
            <Image src="/plataforma/mark.svg" alt="" width={32} height={32} className="size-8" />
            <span className="font-display font-semibold">
              LOCAKAR <span className="pl-accent">SaaS</span>
            </span>
          </Link>
          <p className="pl-muted mt-4 max-w-xs text-sm leading-relaxed">Sistema de gestão para locadoras de veículos, com aplicativo para o locatário na marca da sua locadora.</p>
          <p className="pl-text-2 mt-5 text-sm">
            Contato:{" "}
            <TrackedLink href={WA.know} event="whatsapp_clicked" params={{ place: "footer" }} className="pl-link">
              WhatsApp {PLATFORM.whatsapp.display}
            </TrackedLink>
          </p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="pl-eyebrow">{c.title}</h2>
            <ul className="mt-4 grid gap-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="pl-text-2 text-sm hover:text-[var(--pl-accent)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t pl-line">
        <p className="pl-muted mx-auto max-w-6xl px-4 py-5 text-xs sm:px-6">
          © {year} {PLATFORM.name}. Telas com dados fictícios de demonstração.
        </p>
      </div>
    </footer>
  );
}
