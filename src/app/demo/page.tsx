import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PlatformFooter } from "@/components/platform-landing/footer";
import { PlatformHeader } from "@/components/platform-landing/interactive";
import { DEMO_ORGS, demoLogo } from "@/lib/demo";
import { PLATFORM } from "@/lib/platform";
import { DemoActions } from "./demo-actions";

const TRY = [
  "Dashboard com frota, ocupação, faturamento e atrasos",
  "Cadastrar veículo, cliente e nova locação",
  "Parcelas, multa e juros calculados sozinhos",
  "Despesas, manutenções, multas e relatórios",
  "Identidade visual: troque logo e cores em Configurações",
  "App do locatário com a marca de cada locadora",
];

/** Demonstração pública: duas locadoras fictícias, painel e app, dados só no navegador. */
export default function DemoPage() {
  return (
    <>
      <PlatformHeader home="/" />
      <main id="conteudo" className="relative overflow-hidden">
        <div className="fe-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <section className="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
          <p className="fe-chip mx-auto">Demonstração ao vivo · sem cadastro</p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-balance sm:text-5xl">
            Use o {PLATFORM.name} agora, com <span className="fe-gradient-text">duas locadoras de exemplo</span>.
          </h1>
          <p className="fe-text-2 mx-auto mt-5 max-w-2xl text-base sm:text-lg">
            Entre no painel do dono da locadora ou no app do cliente. Tudo é fictício e fica só neste navegador: pode cadastrar, editar e excluir à vontade.
          </p>

          <div className="mt-12 grid gap-5 text-left md:grid-cols-2">
            {Object.values(DEMO_ORGS).map((o) => (
              <article key={o.slug} className="fe-card fe-card-hover p-6 sm:p-8" aria-labelledby={`demo-${o.slug}`}>
                <Image src={demoLogo(o.slug, "dark")} alt={`${o.name} (locadora fictícia)`} width={560} height={160} className="h-12 w-auto" />
                <h2 id={`demo-${o.slug}`} className="sr-only">{o.name}</h2>
                <p className="fe-text-2 mt-4 text-sm">{o.tagline}</p>
                <p className="fe-muted mt-1 text-xs">{o.city}/{o.state} · 10 veículos · 10 clientes · dados fictícios</p>
                <DemoActions slug={o.slug} />
              </article>
            ))}
          </div>

          <div className="fe-card mx-auto mt-8 max-w-3xl p-6 text-left">
            <p className="text-sm font-semibold">O que testar</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {TRY.map((t) => (
                <li key={t} className="fe-text-2 flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--fe-ok)]" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
            <p className="fe-muted mt-4 flex items-start gap-2 text-xs">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Na demonstração, WhatsApp, e-mail, cobranças reais, assinatura e rastreamento ficam desligados. Nenhum dado é enviado.
            </p>
          </div>
        </section>

        <section aria-labelledby="demo-video" className="relative border-t border-white/[0.07] bg-[var(--fe-bg-2)] py-20">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="fe-eyebrow">Vídeo demonstrativo</p>
              <h2 id="demo-video" className="mt-3 text-3xl font-bold tracking-tight">Veja o sistema funcionando de ponta a ponta.</h2>
              <p className="fe-text-2 mt-4">Do cadastro do carro à cobrança automática e ao app do cliente, em poucos minutos.</p>
              <Link href="/plataforma/cadastro" className="fe-btn fe-btn-primary mt-8">
                Testar com a minha locadora <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-[var(--fe-line-strong)] bg-[#0e0e14] shadow-[0_40px_100px_-30px_rgb(122_0_255/0.6)]">
              <video
                className="block aspect-[9/16] h-auto w-full"
                src="/video/frota-easy-demo.mp4"
                poster="/video/frota-easy-demo-poster.webp"
                width={540}
                height={960}
                controls
                playsInline
                preload="none"
                aria-label={`Vídeo demonstrativo do ${PLATFORM.name}`}
              />
            </div>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </>
  );
}
