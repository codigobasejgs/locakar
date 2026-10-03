import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PlatformFooter } from "./footer";
import { PlatformHeader } from "./interactive";

/** Página de texto (Termos, Privacidade) com o visual da plataforma. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <PlatformHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
        <Link href="/plataforma" className="pl-link inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" aria-hidden="true" /> Voltar
        </Link>
        <h1 className="font-display mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="pl-muted mt-2 text-sm">Atualizado em {updated}</p>
        <div className="pl-text-2 mt-10 grid gap-8 text-[15px] leading-relaxed [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[var(--pl-text)] [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-2 [&_ul]:grid [&_ul]:gap-1.5">
          {children}
        </div>
      </main>
      <PlatformFooter />
    </>
  );
}
