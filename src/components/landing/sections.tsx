import {
  BadgeCheck,
  CarFront,
  HeartHandshake,
  Headset,
  KeyRound,
  ListChecks,
  MessageCircle,
  ScanEye,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { COMPANY, WHATSAPP_MESSAGES } from "@/lib/company";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import { Reveal, SectionHeading } from "./reveal";

/* ---------- Como funciona ---------- */

const STEPS = [
  { icon: CarFront, title: "Escolha seu veículo", text: "Veja os modelos da frota e escolha o que combina com a sua rotina." },
  { icon: MessageCircle, title: "Fale com a LOCAKAR", text: "Chame a nossa equipe no WhatsApp e consulte a disponibilidade." },
  { icon: ListChecks, title: "Combine os detalhes", text: "Defina período, forma de pagamento e documentação necessária." },
  { icon: KeyRound, title: "Retire seu veículo", text: "Com tudo acertado, é só retirar o carro e seguir o seu caminho." },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Como funciona" title="Alugar é simples." description="Um processo direto, sem burocracia desnecessária." />

        <ol className="relative mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div aria-hidden className="absolute left-0 right-0 top-[3.25rem] hidden h-px bg-gradient-to-r from-transparent via-magenta/50 to-transparent lg:block" />
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.1}>
              <li className="glass group relative h-full rounded-3xl p-6 transition-all duration-500 hover:-translate-y-1 hover:border-magenta/40">
                <div className="flex items-center justify-between">
                  <span className="relative grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-magenta to-brand-deep shadow-glow-sm">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="font-display text-4xl font-semibold text-white/10 transition-colors group-hover:text-magenta/40">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-6 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Benefícios ---------- */

const BENEFITS = [
  { icon: HeartHandshake, title: "Atendimento personalizado", text: "Conversa direta com a equipe, entendendo a sua necessidade." },
  { icon: BadgeCheck, title: "Frota selecionada", text: "Veículos escolhidos para oferecer economia e conforto no dia a dia." },
  { icon: Zap, title: "Processo simples", text: "Poucos passos entre o primeiro contato e a retirada do veículo." },
  { icon: Sparkles, title: "Praticidade", text: "Contato rápido pelo WhatsApp para consultar, reservar e tirar dúvidas." },
  { icon: ScanEye, title: "Transparência", text: "Condições combinadas de forma clara antes da retirada." },
  { icon: Headset, title: "Suporte", text: "Acompanhamento durante a locação sempre que você precisar." },
];

export function Benefits() {
  return (
    <section aria-labelledby="beneficios" className="relative py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-ink/70 to-transparent" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div id="beneficios">
          <SectionHeading eyebrow="Benefícios" title="Por que escolher a LOCAKAR." />
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.08}>
              <div className="glass group h-full rounded-3xl p-6 transition-all duration-500 hover:border-magenta/40 hover:bg-[rgb(20_0_20/0.55)]">
                <Icon className="size-7 text-brand-soft transition-transform duration-500 group-hover:scale-110" aria-hidden />
                <h3 className="mt-5 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Sobre ---------- */

export function About() {
  return (
    <section id="sobre" aria-labelledby="sobre-title" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:px-8">
        <Reveal className="flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 -z-10 scale-110 rounded-full bg-magenta/25 blur-3xl" aria-hidden />
            <Logo variant="circular" className="w-60 drop-shadow-2xl sm:w-72" />
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-soft">Sobre a LOCAKAR</p>
          <h2 id="sobre-title" className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            Mobilidade com confiança.
          </h2>
          <div className="mt-6 space-y-4 text-base leading-relaxed text-zinc-300 sm:text-lg">
            <p>
              A LOCAKAR é uma locadora de veículos dedicada a tornar o aluguel de carros uma experiência simples, clara e
              próxima de quem precisa se locomover.
            </p>
            <p>
              Trabalhamos com uma frota selecionada e um atendimento direto, para que cada cliente encontre a opção certa
              para a sua rotina — com praticidade do primeiro contato até a devolução.
            </p>
          </div>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {["Atendimento direto pelo WhatsApp", "Condições combinadas com clareza", "Veículos revisados", "Acompanhamento durante a locação"].map(
              (item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-zinc-200">
                  <ShieldCheck className="size-4 shrink-0 text-brand-soft" aria-hidden />
                  {item}
                </li>
              ),
            )}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- CTA final ---------- */

export function FinalCta() {
  return (
    <section id="contato" aria-labelledby="cta-title" className="relative scroll-mt-20 px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-magenta/30 bg-[rgb(10_0_10/0.7)] px-6 py-16 text-center backdrop-blur-xl sm:px-12 sm:py-20">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-magenta/35 blur-[100px]" aria-hidden />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-soft/60 to-transparent" aria-hidden />
          <h2 id="cta-title" className="relative font-display text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Pronto para seguir o seu caminho?
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-base text-zinc-300 sm:text-lg">
            Fale com a LOCAKAR e consulte as opções disponíveis.
          </p>
          <div className="relative mt-10 flex flex-col items-center gap-4">
            <Button asChild variant="whatsapp" size="lg" className="h-14 px-8 text-base">
              <a href={getWhatsAppUrl(WHATSAPP_MESSAGES.booking)} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="size-5" />
                Falar com a LOCAKAR
              </a>
            </Button>
            <p className="text-sm text-zinc-400">
              WhatsApp <span className="font-semibold text-white">{COMPANY.whatsapp.display}</span>
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
