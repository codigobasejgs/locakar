"use client";

import { CheckCircle2, ShieldAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/permissions";
import { PLATFORM } from "@/lib/platform";
import type { OrgRole } from "@/types";

interface InviteInfo {
  email: string;
  role: OrgRole;
  orgName: string;
}

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<InviteInfo | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/platform/invite?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Convite inválido.");
        }
        return r.json();
      })
      .then(setInfo)
      .catch((e: Error) => {
        setError(e.message);
        setInfo(null);
      });
  }, [token]);

  const accept = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/platform/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível aceitar o convite.");
      toast.success("Acesso concedido com sucesso!");
      // Navegação completa: recarrega a sessão e a locadora ativa do zero.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/admin");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 py-12 text-white">
      <div className="w-full max-w-md text-center">
        {info === undefined && <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />}

        {error && (
          <div className="rounded-2xl border border-line bg-surface p-6">
            <ShieldAlert className="mx-auto size-12 text-red-400" />
            <h1 className="mt-4 font-display text-xl font-bold">Convite não disponível</h1>
            <p className="mt-2 text-sm text-zinc-400">{error}</p>
            <Button asChild className="mt-6 w-full" variant="outline">
              <Link href="/admin/login">Ir para o login</Link>
            </Button>
          </div>
        )}

        {info && (
          <div className="rounded-2xl border border-line bg-surface p-6">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-500/15 text-blue-400">
              <UserPlus className="size-6" />
            </div>
            <h1 className="mt-4 font-display text-xl font-bold">Convite de equipe</h1>
            <p className="mt-2 text-sm text-zinc-300">
              Você foi convidado para acessar <strong>{info.orgName}</strong> na função de{" "}
              <strong>{ROLE_LABEL[info.role] ?? info.role}</strong>.
            </p>
            <p className="mt-1 text-xs text-muted">Destinado a: {info.email}</p>

            <div className="mt-6 space-y-2">
              <Button onClick={accept} disabled={loading} size="lg" className="w-full">
                <CheckCircle2 className="size-4" /> {loading ? "Confirmando..." : "Aceitar e entrar"}
              </Button>
              <p className="text-[11px] text-muted">
                Se ainda não tem conta com este e-mail, crie-a primeiro em{" "}
                <Link href="/admin/login" className="underline text-zinc-300">
                  Login
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-muted">{PLATFORM.name}</p>
      </div>
    </main>
  );
}
