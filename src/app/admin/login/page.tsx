"use client";

import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Logo } from "@/components/ui/logo";
import { authService } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";
import { isSupabaseEnabled } from "@/lib/supabase/env";

/** Só aceita retorno para dentro do painel (evita redirecionamento aberto via ?next=). */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  return next.startsWith("/admin") && !next.startsWith("//") ? next : ROUTES.admin;
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await authService.signIn(String(form.get("email")), String(form.get("password")));
      // Navegação completa: o proxy passa a enxergar os cookies da nova sessão.
      window.location.assign(nextPath());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
      setLoading(false);
    }
  };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
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
            {error && (
              <p role="alert" id="login-error" className="rounded-xl border border-red-400/25 bg-red-400/[0.08] px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>

          {!isSupabaseEnabled && (
            <p className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-200/90">
              Modo demonstração: nenhuma senha é validada ou armazenada.
            </p>
          )}
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
