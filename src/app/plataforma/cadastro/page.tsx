"use client";

import { Building2, CheckCircle2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { PLATFORM } from "@/lib/platform";
import { getSupabase } from "@/lib/supabase/client";

export default function CadastroPlataformaPage() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"form" | "confirm_email">("form");
  const [loading, setLoading] = useState(false);
  const [existingOrg, setExistingOrg] = useState<string | null>(null);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slug) {
      setSlug(
        v
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "-")
          .replace(/-+/g, "-")
          .slice(0, 30),
      );
    }
  };

  const submit = async (e: React.FormEvent | null, confirmExisting = false) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const sb = getSupabase();
      // Cria a conta do dono se ainda não estiver logado
      const { data: session } = await sb.auth.getSession();
      if (!session.session) {
        const { data: up, error: upErr } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (upErr) throw upErr;
        if (!up.session) {
          setStep("confirm_email");
          toast.success("Enviamos um link de confirmação para o seu e-mail.");
          return;
        }
      }

      // Conta confirmada/sessão ativa: cria a organização
      const res = await fetch("/api/platform/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, phone, confirmExisting }),
      });
      const json = await res.json();
      if (json.needsConfirm) {
        setExistingOrg(json.current);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Não foi possível criar a locadora.");
      toast.success("Locadora criada com 30 dias de teste grátis! O painel agora abre nela; use o seletor no topo para trocar de locadora.");
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
      <div className="w-full max-w-md">
        <div className="text-center">
          <Link href="/plataforma" className="inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 text-white shadow-lg">
              <Building2 className="size-5" />
            </span>
            <span>{PLATFORM.name}</span>
          </Link>
          <h1 className="mt-6 font-display text-2xl font-bold">Comece seu teste grátis</h1>
          <p className="mt-2 text-sm text-zinc-400">
            30 dias de acesso completo sem compromisso. Sem cartão de crédito.
          </p>
        </div>

        {existingOrg ? (
          <div className="mt-8 space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6">
            <h2 className="font-display text-lg font-semibold">Você já está logado como equipe da {existingOrg}</h2>
            <p className="text-sm text-zinc-300">
              Uma nova locadora deve ter o <strong>login do próprio dono</strong>. Saia desta conta e cadastre com outro e-mail.
              Se você também é dono da nova locadora, pode criá-la nesta conta: o painel passa a abrir nela e você alterna pelo seletor no topo.
            </p>
            <div className="grid gap-2">
              <Button
                onClick={async () => {
                  await getSupabase().auth.signOut();
                  setExistingOrg(null);
                  toast.success("Conta desconectada. Cadastre a nova locadora com o e-mail do dono dela.");
                }}
              >
                Sair e cadastrar com outro e-mail
              </Button>
              <Button variant="outline" disabled={loading} onClick={() => submit(null, true)}>
                Também sou dono: criar nesta conta
              </Button>
            </div>
          </div>
        ) : step === "confirm_email" ? (
          <div className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center">
            <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
            <h2 className="mt-4 font-display text-lg font-semibold">Confirme seu e-mail</h2>
            <p className="mt-2 text-sm text-zinc-300">
              Enviamos um link para <strong>{email}</strong>. Abra a mensagem e clique no link para ativar sua conta e concluir o cadastro.
            </p>
            <Button className="mt-6 w-full" variant="outline" onClick={() => setStep("form")}>
              Voltar ao formulário
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-line bg-surface p-6">
            <Field label="Nome da sua locadora" htmlFor="r-name" required>
              <Input id="r-name" value={name} onChange={(e) => handleNameChange(e.target.value)} required placeholder="Ex.: Rota Sul Locadora" />
            </Field>

            <Field label="Endereço exclusivo no sistema" htmlFor="r-slug" required hint="Usado no aplicativo e nos links">
              <div className="flex items-center rounded-xl border border-line bg-panel px-3">
                <span className="text-xs text-muted">app/</span>
                <input
                  id="r-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  required
                  placeholder="rota-sul"
                  className="w-full bg-transparent px-1 py-2 text-xs text-white outline-none"
                />
              </div>
            </Field>

            <Field label="WhatsApp de contato" htmlFor="r-phone">
              <Input id="r-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-0000" />
            </Field>

            <div className="pt-2 border-t border-line space-y-4">
              <Field label="Seu e-mail de acesso" htmlFor="r-email" required>
                <Input id="r-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@sualocadora.com" />
              </Field>

              <Field label="Crie uma senha" htmlFor="r-pass" required hint="Mínimo 6 caracteres">
                <Input id="r-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
              </Field>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              <Sparkles className="size-4" /> {loading ? "Criando locadora..." : "Criar minha locadora"}
            </Button>

            <p className="text-center text-xs text-muted">
              Ao continuar, você concorda com os{" "}
              <Link href="/plataforma/termos" className="text-zinc-300 underline">
                Termos
              </Link>{" "}
              e a{" "}
              <Link href="/plataforma/privacidade" className="text-zinc-300 underline">
                Privacidade
              </Link>
              .
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
