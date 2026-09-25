import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 text-center">
      <div>
        <Logo className="mx-auto w-40 logo-glow" />
        <p className="mt-10 font-display text-6xl font-semibold text-gradient-brand">404</p>
        <h1 className="mt-2 text-lg text-zinc-300">Página não encontrada.</h1>
        <Button asChild className="mt-8">
          <Link href="/">Voltar ao início</Link>
        </Button>
      </div>
    </main>
  );
}
