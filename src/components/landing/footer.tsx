import { Globe, Settings } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { COMPANY, WHATSAPP_MESSAGES } from "@/lib/company";
import { LANDING_NAV, ROUTES } from "@/lib/constants";
import { getWhatsAppUrl } from "@/lib/whatsapp";

export function Footer() {
  return (
    <footer className="relative border-t border-white/8 bg-ink">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <Logo className="w-36" />
          <p className="mt-4 max-w-xs text-sm text-zinc-400">
            Mobilidade, praticidade e atendimento personalizado para você seguir o seu caminho.
          </p>
        </div>

        <nav aria-label="Rodapé">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Navegação</h2>
          <ul className="mt-4 space-y-2.5">
            {LANDING_NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="text-sm text-zinc-300 hover:text-white">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Contato</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li>
              <a
                href={getWhatsAppUrl(WHATSAPP_MESSAGES.availability)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-zinc-300 hover:text-white"
              >
                <WhatsAppIcon className="size-4 text-[#25D366]" />
                {COMPANY.whatsapp.display}
              </a>
            </li>
            <li>
              <a href={COMPANY.siteUrl} className="inline-flex items-center gap-2 text-zinc-300 hover:text-white">
                <Globe className="size-4 text-brand-soft" aria-hidden />
                {COMPANY.site}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 pr-20 text-xs text-zinc-500 sm:px-6 sm:pr-24 lg:px-8">
          <p>© 2026 {COMPANY.name}. Todos os direitos reservados.</p>
          {/* Acesso discreto à área interna (não é autenticação). Atalho: Ctrl + Shift + A */}
          <Link
            href={ROUTES.admin}
            aria-label="Área interna"
            title="Área interna"
            className="rounded-md p-1 text-zinc-700 transition-colors hover:text-zinc-400"
          >
            <Settings className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </footer>
  );
}
