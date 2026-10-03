"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useHelp } from "@/help/components/context";

/**
 * "Novo por aqui?" no Dashboard + tour de 4 passos. Aparece uma vez por pessoa/locadora (proprietário ou
 * administrador); "Agora não" também conta. Preferência só no aparelho: se o storage falhar, não insiste.
 */
const STEPS = [
  { target: null, title: "Este é o resumo da sua operação", text: "O Dashboard mostra frota, locações, recebimentos e pendências do período escolhido." },
  { target: 'aside a[href="/admin/vehicles"]', title: "Aqui você cuida da frota", text: "Em Veículos você cadastra carros e motos, documentos, fotos e valor FIPE." },
  { target: 'aside a[href="/admin/pagamentos"]', title: "Aqui ficam os pagamentos", text: "Cobranças das locações: dar baixa, cobrar pelo WhatsApp e conferir comprovantes PIX." },
  { target: '[aria-label="Abrir ajuda sobre esta página"]', title: "Ajuda sempre à mão", text: "Este botão abre os tutoriais da tela em que você está. Ctrl + K pesquisa qualquer dúvida." },
];

export function WelcomeTour() {
  const { access, base, storageKey } = useHelp();
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<number | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  const eligible = access.role === "owner" || access.role === "admin";
  const key = `${storageKey}:welcome`;

  useEffect(() => {
    if (!eligible) return;
    let seen = true;
    try {
      seen = localStorage.getItem(key) === "1";
    } catch {
      /* sem storage: não mostra para não repetir a cada visita */
    }
    if (!seen) Promise.resolve().then(() => setShow(true));
  }, [eligible, key]);

  const finish = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ok */
    }
    setShow(false);
    setStep(null);
  };

  useEffect(() => {
    if (step === null) return;
    const sel = STEPS[step].target;
    const el = sel ? (Array.from(document.querySelectorAll(sel)).find((e) => (e as HTMLElement).offsetParent !== null) as HTMLElement | undefined) : undefined;
    el?.scrollIntoView({ block: "nearest" });
    const t = setTimeout(() => setBox(el ? el.getBoundingClientRect() : null), 50);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!show) return null;

  if (step === null) {
    return (
      <section aria-label="Bem-vindo" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-magenta/30 bg-magenta/5 p-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-soft"><Sparkles className="size-3.5" /> Novo por aqui?</p>
          <p className="mt-1 text-sm text-zinc-200">Conheça o painel em 1 minuto ou siga o treinamento passo a passo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setStep(0)}>Fazer tour</Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`${base}/treinamentos/primeiros-passos`} onClick={finish}>Começar treinamento</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={finish}>Agora não</Button>
        </div>
      </section>
    );
  }

  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  // Cartão ao lado do elemento destacado (ou no centro, se não houver elemento visível).
  const card = box
    ? { top: Math.min(Math.max(box.top, 16), window.innerHeight - 220), left: Math.min(box.right + 16, window.innerWidth - 336) }
    : { top: window.innerHeight / 2 - 100, left: window.innerWidth / 2 - 160 };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Tour: ${s.title}`}>
      <div className="absolute inset-0 bg-black/60" onClick={finish} />
      {box && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-brand-soft"
          style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8, boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }}
        />
      )}
      <div className="absolute w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line-strong bg-panel p-4 shadow-2xl" style={card}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-soft">{step + 1} de {STEPS.length}</p>
          <button type="button" onClick={finish} aria-label="Fechar tour" className="text-muted hover:text-white"><X className="size-4" /></button>
        </div>
        <h2 className="mt-1 font-semibold text-white">{s.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-zinc-300">{s.text}</p>
        <div className="mt-4 flex justify-between gap-2">
          <Button size="sm" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</Button>
          <Button size="sm" autoFocus onClick={() => (last ? finish() : setStep(step + 1))}>{last ? "Concluir" : "Próximo"}</Button>
        </div>
      </div>
    </div>
  );
}
