"use client";

import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Logo } from "@/components/ui/logo";
import { authService } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";

/** Tela de acesso — visual pronto; autenticação real virá com Supabase Auth (ver src/lib/auth.ts). */
export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    await authService.signIn(String(form.get("email")), String(form.get("password")));
    router.push(ROUTES.admin);
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-magenta/20 blur-[120px]" aria-hidden />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo priority className="w-44 logo-glow" />
        </div>
        <div className="rounded-3xl border border-line-strong bg-panel/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8">
          <h1 className="font-display text-xl font-semibold">Acesso ao painel</h1>
          <p className="mt-1 text-sm text-muted">Entre com suas credenciais de administrador.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="E-mail" htmlFor="email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
                <Input id="email" name="email" type="email" autoComplete="username" required className="pl-9" placeholder="voce@exemplo.com" />
              </div>
            </Field>
            <Field label="Senha" htmlFor="password">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
                <Input id="password" name="password" type="password" autoComplete="current-password" required className="pl-9" />
              </div>
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          <p className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200/90">
            Modo demonstração: nenhuma senha é validada ou armazenada.
          </p>
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href={ROUTES.home} className="text-muted hover:text-white">
            ← Voltar ao site
          </Link>
        </p>
      </div>
    </main>
  );
}
