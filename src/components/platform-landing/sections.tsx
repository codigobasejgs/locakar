import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CalendarClock,
  Camera,
  Check,
  CircleDollarSign,
  ClipboardCheck,
  FileSignature,
  Gauge,
  GraduationCap,
  KeyRound,
  Lock,
  MessageCircle,
  PlayCircle,
  QrCode,
  Receipt,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { Reveal } from "@/components/landing/reveal";
import { brl, planHasFeature, planPrice, type PlanFeature, type PlanRow } from "@/lib/plans";
import { FAQ, PLATFORM, WA } from "./content";
import { BrandSwitcher, ProductShowcase, TrackedLink, ViewTracker } from "./interactive";

/* ---------- Composição ---------- */

function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

function Heading({ eyebrow, title, text, center = false, id }: { eyebrow: string; title: React.ReactNode; text?: string; center?: boolean; id?: string }) {
  return (
    <Reveal className={center ? "mx-auto max-w-3xl text-center" : "max-w-2xl"}>
      <p className="fe-eyebrow">{eyebrow}</p>
      <h2 id={id} className="mt-4 text-3xl font-bold leading-[1.1] tracking-tight text-balance sm:text-[2.6rem]">
        {title}
      </h2>
      {text && <p className="fe-text-2 mt-5 text-base leading-relaxed text-pretty sm:text-lg">{text}</p>}
    </Reveal>
  );
}

function Phone({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`fe-phone ${className}`}>
      <div>
        <Image src={src} alt={alt} width={780} height={1688} sizes="240px" loading="lazy" className="block h-auto w-full" />
      </div>
    </div>
  );
}

/* ---------- Hero ---------- */

export function Hero() {
  return (
    <section aria-labelledby="fe-hero-title" className="relative overflow-hidden">
      <div className="fe-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="fe-glow pointer-events-none absolute left-1/2 top-[-12rem] size-[56rem] max-w-[140%] -translate-x-1/2" aria-hidden="true" />
      <Container className="relative pb-20 pt-14 text-center sm:pt-20 lg:pb-28 lg:pt-24">
        <Reveal>
          <p className="fe-chip">
            <Zap className="size-3.5" aria-hidden="true" /> Frota Easy SaaS • Controle de locadoras de veículos
          </p>
          <h1 id="fe-hero-title" className="mx-auto mt-7 max-w-5xl text-[2.35rem] font-bold leading-[1.04] tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.4rem]">
            O sistema definitivo para <span className="fe-gradient-text">escalar e automatizar</span> sua locadora de veículos.
          </h1>
          <p className="fe-text-2 mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pretty sm:text-lg">
            Carros e motos do contrato ao recebimento: cobranças automáticas, assinatura digital, rastreamento, aplicativo próprio para o seu locatário e um Copiloto que administra a locadora pelo WhatsApp.
          </p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <TrackedLink href={PLATFORM.signup} event="hero_cta_clicked" params={{ place: "hero" }} className="fe-btn fe-btn-primary !min-h-[52px] !px-7 !text-base">
              Quero automatizar minha locadora <ArrowRight className="size-4" aria-hidden="true" />
            </TrackedLink>
            <TrackedLink href={WA.demo} event="demo_requested" params={{ place: "hero" }} className="fe-btn fe-btn-ghost !min-h-[52px] !px-7 !text-base">
              <PlayCircle className="size-4" aria-hidden="true" /> Ver demonstração ao vivo
            </TrackedLink>
          </div>
          <p className="fe-muted mt-5 text-sm">{PLATFORM.trialDays} dias grátis · Sem cartão de crédito · Implantação guiada</p>
        </Reveal>

        <Reveal delay={0.15} className="relative mx-auto mt-16 max-w-6xl text-left">
          <ProductShowcase />
          <div className="pointer-events-none absolute -bottom-10 -right-2 hidden w-[17%] min-w-[150px] max-w-[210px] lg:block">
            <Phone src="/plataforma/app-inicio-dark.webp" alt="Aplicativo do locatário com a locação em andamento" className="fe-float" />
          </div>
          <div className="fe-card pointer-events-none absolute -left-6 top-1/3 hidden max-w-[220px] bg-[#14141c]/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl lg:block">
            <p className="flex items-center gap-2 text-sm font-semibold"><Check className="size-4 text-[var(--fe-ok)]" aria-hidden="true" /> Pix recebido</p>
            <p className="fe-muted mt-1 text-xs">Parcela baixada sozinha e recibo enviado ao cliente.</p>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- Vídeo de apresentação ---------- */

// ponytail: sem autoplay e com preload="none" (8 MB só baixam no play); legenda .vtt quando houver narração transcrita.
export function VideoTour() {
  const points = ["App do locatário com Pix e parcelas", "Copiloto respondendo no WhatsApp", "CRLV-e e Tabela FIPE para carros e motos"];
  return (
    <section id="video" aria-labelledby="fe-video" className="relative overflow-hidden py-24 sm:py-32">
      <div className="fe-glow-soft pointer-events-none absolute right-[-10rem] top-1/2 size-[40rem] -translate-y-1/2" aria-hidden="true" />
      <Container className="relative grid items-center gap-12 lg:grid-cols-2">
        <div>
          <Heading eyebrow="Tour em 15 segundos" id="fe-video" title={<>Veja o Frota Easy <span className="fe-gradient-text">em ação</span>.</>} text="Do aplicativo do seu cliente ao Copiloto no WhatsApp: tudo o que a sua locadora ganha, em menos de um minuto." />
          <ul className="mt-8 grid gap-3">
            {points.map((p) => (
              <li key={p} className="fe-text-2 flex items-center gap-3 text-[15px]">
                <Check className="size-4 shrink-0 text-[var(--fe-accent-text)]" aria-hidden="true" /> {p}
              </li>
            ))}
          </ul>
          <TrackedLink href={PLATFORM.signup} event="hero_cta_clicked" params={{ place: "video" }} className="fe-btn fe-btn-primary mt-9">
            Testar grátis por {PLATFORM.trialDays} dias <ArrowRight className="size-4" aria-hidden="true" />
          </TrackedLink>
        </div>
        <Reveal className="mx-auto w-full max-w-[340px]">
          <div className="overflow-hidden rounded-[2rem] border border-[var(--fe-line-strong)] bg-[#0e0e14] shadow-[0_40px_100px_-30px_rgb(122_0_255/0.6)]">
            <video
              className="block aspect-[9/16] h-auto w-full bg-[#0e0e14]"
              src="/video/frota-easy-tour.mp4"
              poster="/video/frota-easy-tour-poster.webp"
              width={1080}
              height={1920}
              controls
              playsInline
              preload="none"
              aria-label="Vídeo de apresentação do Frota Easy: app do locatário, Copiloto no WhatsApp e cadastro de veículos com CRLV-e e FIPE"
            />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- Faixa de confiança ---------- */

export function TrustBar() {
  const items = ["Asaas", "InfinitePay", "Mercado Pago", "PagBank", "Pagar.me · Stone", "Autentique", "Tabela FIPE", "WhatsApp"];
  return (
    <section aria-label="Integrações" className="border-y border-white/[0.07] bg-[var(--fe-bg-2)] py-8">
      <Container>
        <p className="fe-muted text-center text-xs font-semibold uppercase tracking-[0.18em]">Conectado com quem a sua locadora já usa</p>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {items.map((i) => (
            <li key={i} className="fe-text-2 text-sm font-semibold tracking-tight opacity-80">{i}</li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ---------- Bento de diferenciais ---------- */

const BENTO: { icon: typeof Bot; title: string; text: string; span?: string; tag?: string }[] = [
  { icon: Bot, title: "Copiloto no WhatsApp + autoatendimento", text: "Administre a locadora conversando: baixa com 1 toque, leitura de notas de oficina por foto ou PDF, relatórios na hora. Seus clientes pedem 2ª via, pagam e enviam documentos pelo mesmo número.", span: "lg:col-span-2 lg:row-span-2", tag: "Exclusivo" },
  { icon: CircleDollarSign, title: "Cobrança automática integrada", text: "Pix copia e cola, boleto e cartão em até 12x por Asaas, InfinitePay, Mercado Pago, PagBank ou Pagar.me. Baixa automática por webhook." },
  { icon: FileSignature, title: "Contratos inteligentes", text: "A IA lê seu modelo uma vez; cada contrato sai preenchido e vai para assinatura eletrônica Autentique com validade jurídica." },
  { icon: ScanLine, title: "CRLV-e + FIPE automática", text: "Importe o documento do veículo e tenha placa, chassi, modelo e valor FIPE preenchidos sozinhos." },
  { icon: Wrench, title: "Manutenção, multas e rastreamento", text: "Hodômetro, alertas de revisão, histórico de oficina, multas e lucro líquido real por placa (Vehicle 360)." },
  { icon: Smartphone, title: "App do locatário white label", text: "Com o logo e as cores da sua locadora: parcelas, ocorrências, documentos e vistoria guiada de 9 fotos com assinatura na tela.", span: "lg:col-span-2" },
  { icon: GraduationCap, title: "Central de Ajuda e tour guiado", text: "Sua equipe aprende dentro da própria tela, com passo a passo interativo.", span: "lg:col-span-2" },
];

export function Bento() {
  return (
    <section id="funcionalidades" aria-labelledby="fe-bento" className="relative py-24 sm:py-32">
      <ViewTracker event="features_viewed" />
      <Container>
        <Heading center id="fe-bento" eyebrow="Diferenciais" title={<>Tudo o que sua locadora precisa, <span className="fe-gradient-text">funcionando junto</span>.</>} text="Nada de cinco sistemas, planilhas e grupos de WhatsApp. Um painel só, do primeiro contato ao último pagamento." />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[minmax(190px,auto)]">
          {BENTO.map((b, i) => (
            <Reveal key={b.title} delay={i * 0.04} className={`fe-card fe-card-hover relative overflow-hidden p-6 sm:p-7 ${b.span ?? ""}`}>
              {b.span?.includes("row-span-2") && <div className="fe-glow-soft pointer-events-none absolute -right-20 -top-20 size-72" aria-hidden="true" />}
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-xl border border-[rgb(166_77_255/0.35)] bg-[rgb(122_0_255/0.15)] text-[var(--fe-accent-text)]">
                    <b.icon className="size-5" aria-hidden="true" />
                  </span>
                  {b.tag && <span className="fe-chip !px-2.5 !py-1 !text-[10px]">{b.tag}</span>}
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{b.title}</h3>
                <p className="fe-text-2 mt-2.5 text-[15px] leading-relaxed">{b.text}</p>
                {b.span?.includes("row-span-2") && <CopilotChat className="mt-6 lg:mt-auto" />}
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Mock do Copiloto (conversa real do fluxo) ---------- */

function CopilotChat({ className = "" }: { className?: string }) {
  return (
    <figure className={`fe-wa overflow-hidden rounded-2xl border border-white/10 ${className}`} aria-label="Exemplo de conversa com o Copiloto no WhatsApp">
      <div className="flex items-center gap-2.5 border-b border-white/10 bg-[#202c33] px-4 py-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-[var(--fe-primary)]"><Bot className="size-4" aria-hidden="true" /></span>
        <div>
          <p className="text-sm font-semibold text-[#e9edef]">Copiloto</p>
          <p className="text-[11px] text-[#8696a0]">online</p>
        </div>
      </div>
      <div className="grid gap-2.5 p-4 text-[13px] leading-snug">
        <p className="fe-wa-out ml-auto max-w-[80%] px-3 py-2">Quem está com pagamento atrasado?</p>
        <div className="fe-wa-in max-w-[88%] overflow-hidden">
          <p className="px-3 pt-2">⚠️ <b>2 parcelas em atraso</b> · R$ 1.296,00<br />João S. · ABC1D23 · 4 dias<br />Maria L. · QWE4R56 · 1 dia</p>
          <div className="mt-2 grid grid-cols-2 text-center text-[12px] font-medium">
            <span className="fe-wa-btn border-r border-white/[0.08] py-2">📲 Cobrar</span>
            <span className="fe-wa-btn py-2">✅ Dar baixa</span>
          </div>
        </div>
        <p className="fe-wa-out ml-auto max-w-[80%] px-3 py-2">✅ Dar baixa · João</p>
        <p className="fe-wa-in max-w-[88%] px-3 py-2">Pronto! Parcela de João baixada e recibo enviado. 🧾</p>
      </div>
    </figure>
  );
}

/* ---------- Copiloto em destaque ---------- */

export function Copilot() {
  const items = [
    "Baixas, cobranças e consultas por botões — sem IA, sem custo por mensagem",
    "IA opcional lê áudio, foto da nota da oficina e PDF",
    "Confirmação antes de qualquer gravação e permissões por nível",
    "Autoatendimento do cliente: 2ª via, Pix, ocorrência, documentos e vistoria",
  ];
  return (
    <section id="copiloto" aria-labelledby="fe-copilot" className="relative overflow-hidden border-y border-white/[0.07] bg-[var(--fe-bg-2)] py-24 sm:py-32">
      <div className="fe-glow pointer-events-none absolute -left-40 top-1/2 size-[40rem] -translate-y-1/2 opacity-60" aria-hidden="true" />
      <Container className="relative grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Heading id="fe-copilot" eyebrow="Copiloto WhatsApp" title={<>Sua locadora na palma da mão, <span className="fe-gradient-text">pelo WhatsApp</span>.</>} text="O Copiloto atende você e a sua equipe no número da locadora. Seus clientes também resolvem tudo sozinhos, e sempre são levados ao seu aplicativo." />
          <ul className="mt-8 grid gap-3.5">
            {items.map((i) => (
              <li key={i} className="fe-text-2 flex items-start gap-3 text-[15px] leading-snug">
                <BadgeCheck className="mt-0.5 size-5 shrink-0 text-[var(--fe-accent-text)]" aria-hidden="true" /> {i}
              </li>
            ))}
          </ul>
        </div>
        <Reveal delay={0.1} className="mx-auto w-full max-w-md">
          <CopilotChat />
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- Automações ---------- */

export function Automations() {
  const flow = [
    { icon: KeyRound, title: "Locação criada", text: "Parcelas geradas na periodicidade que você escolher, com multa e juros." },
    { icon: FileSignature, title: "Contrato assinado", text: "Preenchido sozinho e enviado para assinatura digital." },
    { icon: Receipt, title: "Cobrança enviada", text: "Pix, boleto ou cartão no WhatsApp e no e-mail, antes do vencimento." },
    { icon: CircleDollarSign, title: "Pagamento baixado", text: "Webhook confirma, a parcela baixa e o recibo sai automático." },
  ];
  return (
    <section id="automacoes" aria-labelledby="fe-auto" className="py-24 sm:py-32">
      <Container>
        <Heading center id="fe-auto" eyebrow="Automações" title="Do contrato ao recebimento, no piloto automático." text="Você define as regras uma vez. O Frota Easy executa todos os dias, sem esquecer ninguém." />
        <ol className="relative mt-16 grid gap-4 md:grid-cols-4">
          <div className="absolute left-0 right-0 top-[34px] hidden h-px bg-gradient-to-r from-transparent via-[rgb(166_77_255/0.5)] to-transparent md:block" aria-hidden="true" />
          {flow.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08} className="relative">
              <li className="fe-card h-full p-6 text-center">
                <span className="relative mx-auto grid size-[68px] place-items-center rounded-2xl border border-[rgb(166_77_255/0.4)] bg-[var(--fe-bg)] text-[var(--fe-accent-text)] shadow-[0_0_40px_-10px_rgb(166_77_255/0.7)]">
                  <f.icon className="size-6" aria-hidden="true" />
                  <span className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-[var(--fe-primary)] text-[11px] font-bold text-white">{i + 1}</span>
                </span>
                <h3 className="mt-5 font-semibold">{f.title}</h3>
                <p className="fe-muted mt-2 text-sm leading-relaxed">{f.text}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/* ---------- Antes x Depois ---------- */

export function BeforeAfter() {
  const before = ["Planilha e caderno para controlar parcelas", "Cobrança manual, um por um, no WhatsApp", "Comprovante perdido no meio da conversa", "Contrato impresso e assinado no balcão", "Não sabe qual carro dá lucro de verdade"];
  const after = ["Parcelas, multa e juros calculados sozinhos", "Cobrança automática por Pix, boleto e cartão", "Baixa automática e recibo enviado ao cliente", "Contrato digital com assinatura eletrônica", "Lucro líquido real por placa, em um clique"];
  return (
    <section aria-labelledby="fe-ba" className="border-y border-white/[0.07] bg-[var(--fe-bg-2)] py-24 sm:py-32">
      <Container>
        <Heading center id="fe-ba" eyebrow="Antes × depois" title="Da locadora no improviso à locadora no piloto automático." />
        <div className="mt-14 grid gap-5 lg:grid-cols-2">
          <Reveal className="fe-card p-7 sm:p-9">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fe-danger)]">Sem Frota Easy</p>
            <ul className="mt-6 grid gap-4">
              {before.map((b) => (
                <li key={b} className="fe-text-2 flex items-start gap-3">
                  <X className="mt-0.5 size-5 shrink-0 text-[var(--fe-danger)]" aria-hidden="true" /> {b}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.1} className="fe-card relative overflow-hidden border-[rgb(166_77_255/0.45)] p-7 sm:p-9">
            <div className="fe-glow-soft pointer-events-none absolute -right-24 -top-24 size-80" aria-hidden="true" />
            <p className="relative text-sm font-semibold uppercase tracking-[0.14em] text-[var(--fe-accent-text)]">Com Frota Easy</p>
            <ul className="relative mt-6 grid gap-4">
              {after.map((a) => (
                <li key={a} className="flex items-start gap-3 text-white">
                  <Check className="mt-0.5 size-5 shrink-0 text-[var(--fe-ok)]" aria-hidden="true" /> {a}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ---------- App white label ---------- */

export function WhiteLabelApp() {
  const feats = [
    { icon: QrCode, text: "Paga parcelas por Pix, boleto ou cartão" },
    { icon: Camera, text: "Vistoria guiada de 9 fotos com assinatura na tela" },
    { icon: ClipboardCheck, text: "Abre ocorrências e envia CNH e comprovantes" },
    { icon: CalendarClock, text: "Pede reservas e acompanha a locação" },
  ];
  return (
    <section id="app" aria-labelledby="fe-app" className="relative overflow-hidden py-24 sm:py-32">
      <div className="fe-glow pointer-events-none absolute -right-40 top-20 size-[44rem] opacity-70" aria-hidden="true" />
      <Container className="relative grid items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <Heading id="fe-app" eyebrow="App do Locatário" title={<>Seu próprio aplicativo, <span className="fe-gradient-text">com a sua marca</span>.</>} text="Cada locadora recebe o próprio link e app instalável com nome, logo e cores dela. Seu cliente vê a sua marca; a tecnologia roda no motor Frota Easy." />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {feats.map((f) => (
              <li key={f.text} className="fe-card flex items-start gap-3 p-4">
                <f.icon className="mt-0.5 size-5 shrink-0 text-[var(--fe-accent-text)]" aria-hidden="true" />
                <span className="fe-text-2 text-sm leading-snug">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <Reveal delay={0.1} className="relative mx-auto flex w-full max-w-lg items-end justify-center gap-4">
          <Phone src="/plataforma/app-locacao-dark.webp" alt="App do locatário: detalhes da locação" className="fe-float-delay w-[44%] translate-y-6" />
          <Phone src="/plataforma/app-pagamentos-dark.webp" alt="App do locatário: parcelas e pagamento" className="fe-float w-[50%]" />
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- White label do painel ---------- */

export function WhiteLabelPanel() {
  return (
    <section aria-labelledby="fe-wl" className="border-y border-white/[0.07] bg-[var(--fe-bg-2)] py-24 sm:py-32">
      <Container>
        <Heading center id="fe-wl" eyebrow="White label" title="O painel também veste a sua marca." text="Troque logo e cores em Configurações: painel, app, e-mails, contratos e recibos passam a sair com a identidade da sua locadora." />
        <Reveal className="mx-auto mt-12 max-w-4xl">
          <BrandSwitcher />
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- Segurança ---------- */

export function Security() {
  const items = [
    { icon: ShieldCheck, title: "Isolamento por locadora", text: "Cada locadora isolada no banco com regras de acesso por linha (RLS)." },
    { icon: Lock, title: "Credenciais cifradas", text: "Chaves de pagamento e IA guardadas com AES-256 e nunca devolvidas ao navegador." },
    { icon: Users, title: "Equipe com papéis", text: "Dono, administrador, financeiro, operador ou somente leitura — cada um vê o que deve." },
    { icon: Gauge, title: "Trilha de auditoria", text: "Quem fez o quê, quando e de onde, para cobranças, contratos e baixas." },
  ];
  return (
    <section aria-labelledby="fe-sec" className="py-24 sm:py-32">
      <Container>
        <Heading center id="fe-sec" eyebrow="Segurança" title="Os dados da sua locadora são só seus." />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((i, n) => (
            <Reveal key={i.title} delay={n * 0.05} className="fe-card fe-card-hover p-6">
              <i.icon className="size-6 text-[var(--fe-accent-text)]" aria-hidden="true" />
              <h3 className="mt-4 font-semibold">{i.title}</h3>
              <p className="fe-muted mt-2 text-sm leading-relaxed">{i.text}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Planos ---------- */

const PLAN_COPY: Record<string, { tagline: string; includes: string[]; excludes?: string[]; base?: string }> = {
  essencial: {
    tagline: "Para organizar a locadora e cobrar sem planilha.",
    includes: [
      "Veículos com CRLV-e e FIPE automática",
      "Clientes, locações e reservas",
      "Pix manual, Asaas e InfinitePay",
      "Financeiro, despesas, manutenções e multas",
      "Relatórios básicos",
      "App do locatário com a sua marca",
    ],
    excludes: ["Sem Copiloto IA no WhatsApp", "Sem check-in periódico semanal/mensal"],
  },
  profissional: {
    tagline: "Para automatizar o dia a dia pelo WhatsApp.",
    base: "Tudo do Essencial, mais:",
    includes: ["Check-in / vistoria periódica semanal ou mensal", "Copiloto e autoatendimento por botões no WhatsApp", "Contratos inteligentes + assinatura Autentique"],
    excludes: ["Sem IA multimodal (áudio e foto)"],
  },
  completo: {
    tagline: "Tudo liberado, com inteligência artificial.",
    base: "Tudo do Profissional, mais:",
    includes: ["Copiloto IA no WhatsApp: áudio, foto e PDF de nota fiscal", "Rastreamento e telemetria (Selsyn)", "Relatórios gerenciais avançados (Visão 360°)"],
  },
};

const COMPARE: { label: string; feature?: PlanFeature }[] = [
  { label: "Frota, clientes, locações e financeiro" },
  { label: "App do locatário white label" },
  { label: "Pix, Asaas e InfinitePay" },
  { label: "Check-in / vistoria periódica", feature: "periodic_checkin" },
  { label: "WhatsApp com botões (sem IA)", feature: "whatsapp_buttons" },
  { label: "Contratos + assinatura Autentique", feature: "smart_contracts" },
  { label: "Copiloto IA: áudio, foto e PDF", feature: "ai_copilot" },
  { label: "Rastreamento Selsyn", feature: "tracking_selsyn" },
  { label: "Relatórios avançados (Visão 360°)", feature: "advanced_reports" },
];

function PriceTag({ plan }: { plan: PlanRow }) {
  const p = planPrice(plan);
  return (
    <div className="mt-6">
      {p.fromCents != null && (
        <p className="fe-muted text-sm">
          De <s className="decoration-[var(--fe-danger)]/70">{brl(p.fromCents)}</s> por
        </p>
      )}
      <p className="mt-1 flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight sm:text-5xl">{brl(p.cents)}</span>
        <span className="fe-muted text-sm font-semibold">/mês</span>
      </p>
    </div>
  );
}

export function Plans({ plans }: { plans: PlanRow[] }) {
  const promo = plans.filter((p) => planPrice(p).promo);
  const promoFrom = promo.length ? Math.min(...promo.map((p) => planPrice(p).cents)) : null;
  return (
    <section id="planos" aria-labelledby="fe-plans" className="relative overflow-hidden border-y border-white/[0.07] bg-[var(--fe-bg-2)] py-24 sm:py-32">
      <ViewTracker event="pricing_viewed" />
      <Container>
        <Heading center id="fe-plans" eyebrow="Planos" title="Um plano para cada fase da sua locadora." text={`Comece com ${PLATFORM.trialDays} dias grátis, com os recursos do Completo (exceto rastreamento) e sem cartão de crédito. Depois, escolha o plano.`} />

        {promoFrom != null && (
          <Reveal className="mx-auto mt-10 max-w-3xl">
            <p className="fe-chip mx-auto flex w-fit max-w-full flex-wrap justify-center !whitespace-normal text-center !normal-case !tracking-normal !text-sm">
              <Zap className="size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>Condição especial de lançamento:</strong> libere todos os recursos do {PLATFORM.name} por {brl(promoFrom)}/mês por tempo limitado.
              </span>
            </p>
          </Reveal>
        )}

        <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-3">
          {plans.map((plan, i) => {
            const copy = PLAN_COPY[plan.id];
            const p = planPrice(plan);
            return (
              <Reveal key={plan.id} delay={i * 0.06} className="h-full">
                <article
                  aria-labelledby={`plan-${plan.id}`}
                  className={`fe-card relative flex h-full flex-col p-7 sm:p-8 ${plan.highlight ? "border-[rgb(166_77_255/0.7)] bg-gradient-to-b from-[rgb(122_0_255/0.16)] to-transparent shadow-[0_30px_90px_-30px_rgb(122_0_255/0.75)]" : ""}`}
                >
                  {plan.highlight && <div className="fe-glow pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 opacity-60" aria-hidden="true" />}
                  <div className="relative flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`plan-${plan.id}`} className="text-xl font-bold">{plan.name}</h3>
                    {plan.highlight && <span className="rounded-full bg-gradient-to-r from-[#7a00ff] to-[#a64dff] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">Mais escolhido</span>}
                  </div>
                  {p.promo && plan.promo_label && <p className="fe-chip relative mt-3 w-fit !text-[10px]">{plan.highlight ? "Tudo liberado • Tempo limitado" : plan.promo_label}</p>}
                  {copy && <p className="fe-text-2 relative mt-3 text-sm">{copy.tagline}</p>}
                  <div className="relative">
                    <PriceTag plan={plan} />
                  </div>
                  <TrackedLink
                    href={PLATFORM.signup}
                    event="hero_cta_clicked"
                    params={{ place: `plan_${plan.id}` }}
                    className={`fe-btn relative mt-7 w-full ${plan.highlight ? "fe-btn-primary" : "fe-btn-ghost"}`}
                  >
                    Testar {PLATFORM.trialDays} dias grátis <ArrowRight className="size-4" aria-hidden="true" />
                  </TrackedLink>
                  {copy && (
                    <div className="relative mt-7 border-t border-white/10 pt-6">
                      {copy.base && <p className="mb-3 text-sm font-semibold">{copy.base}</p>}
                      <ul className="grid gap-3">
                        {copy.includes.map((t) => (
                          <li key={t} className="fe-text-2 flex items-start gap-3 text-[15px]">
                            <Check className="mt-0.5 size-4 shrink-0 text-[var(--fe-ok)]" aria-hidden="true" /> {t}
                          </li>
                        ))}
                        {copy.excludes?.map((t) => (
                          <li key={t} className="fe-muted flex items-start gap-3 text-sm">
                            <X className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden="true" /> {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal className="mt-14">
          <details className="fe-card group overflow-hidden lg:[&>summary]:hidden" open>
            <summary className="flex min-h-[56px] cursor-pointer items-center justify-between px-5 font-semibold">
              Comparar planos
              <span className="fe-faq-icon text-2xl leading-none text-[var(--fe-accent-text)] transition-transform" aria-hidden="true">+</span>
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-xs sm:text-sm">
                <caption className="sr-only">Comparativo de recursos dos planos {PLATFORM.name}</caption>
                <thead>
                  <tr className="border-b border-white/10">
                    <th scope="col" className="w-[40%] p-2.5 font-semibold sm:w-auto sm:p-4">Recurso</th>
                    {plans.map((p) => (
                      <th key={p.id} scope="col" className={`p-2 text-center text-[11px] font-semibold sm:p-4 sm:text-sm ${p.highlight ? "text-[var(--fe-accent-text)]" : ""}`}>
                        <span className="sm:hidden" aria-hidden="true">{p.name.slice(0, 4)}.</span>
                        <span className="sr-only sm:not-sr-only">{p.name}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row) => (
                    <tr key={row.label} className="border-b border-white/[0.06] last:border-0">
                      <th scope="row" className="fe-text-2 p-2.5 font-medium sm:p-4">{row.label}</th>
                      {plans.map((p) => {
                        const on = !row.feature || planHasFeature(p.entitlements, row.feature);
                        return (
                          <td key={p.id} className="p-2 text-center sm:p-4">
                            {on ? <Check className="mx-auto size-5 text-[var(--fe-ok)]" aria-label="Incluso" /> : <X className="mx-auto size-5 text-white/30" aria-label="Não incluso" />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Reveal>

        {promoFrom != null && (
          <p className="fe-muted mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed">
            Valor promocional de lançamento por tempo limitado. Após o período promocional, novos assinantes seguem o valor de tabela de cada plano.
          </p>
        )}
        <p className="mt-6 text-center text-sm">
          <TrackedLink href={WA.proposal} event="demo_requested" params={{ place: "plans" }} className="fe-link">
            Frota grande ou várias unidades? Fale com a gente
          </TrackedLink>
        </p>
      </Container>
    </section>
  );
}

/* ---------- FAQ ---------- */

export function Faq() {
  return (
    <section id="faq" aria-labelledby="fe-faq" className="py-24 sm:py-32">
      <Container className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <Heading id="fe-faq" eyebrow="Dúvidas" title="Perguntas frequentes" text="Não encontrou a resposta? Fale com a equipe Frota Easy no WhatsApp." />
        <div className="grid gap-3">
          {FAQ.map((f) => (
            <details key={f.q} className="fe-card group px-5 sm:px-6">
              <summary className="flex min-h-[60px] items-center justify-between gap-4 py-4 font-semibold">
                {f.q}
                <span className="fe-faq-icon text-2xl leading-none text-[var(--fe-accent-text)] transition-transform" aria-hidden="true">+</span>
              </summary>
              <p className="fe-text-2 pb-5 text-[15px] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- CTA final ---------- */

export function FinalCta() {
  return (
    <section aria-labelledby="fe-final" className="relative overflow-hidden py-28 sm:py-36">
      <div className="fe-grid pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="fe-glow pointer-events-none absolute left-1/2 top-1/2 size-[48rem] max-w-[140%] -translate-x-1/2 -translate-y-1/2" aria-hidden="true" />
      <Container className="relative text-center">
        <Sparkles className="mx-auto size-8 text-[var(--fe-accent-text)]" aria-hidden="true" />
        <h2 id="fe-final" className="mx-auto mt-6 max-w-4xl text-3xl font-bold leading-[1.08] tracking-tight text-balance sm:text-5xl">
          Coloque sua locadora no <span className="fe-gradient-text">piloto automático</span> hoje.
        </h2>
        <p className="fe-text-2 mx-auto mt-6 max-w-xl text-lg">Comece grátis e veja a primeira cobrança automática sair ainda esta semana.</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <TrackedLink href={PLATFORM.signup} event="hero_cta_clicked" params={{ place: "final" }} className="fe-btn fe-btn-primary !min-h-[52px] !px-7 !text-base">
            Testar Frota Easy grátis <ArrowRight className="size-4" aria-hidden="true" />
          </TrackedLink>
          <TrackedLink href={WA.know} event="whatsapp_clicked" params={{ place: "final" }} className="fe-btn fe-btn-ghost !min-h-[52px] !px-7 !text-base">
            <MessageCircle className="size-4" aria-hidden="true" /> Falar com um especialista
          </TrackedLink>
        </div>
      </Container>
    </section>
  );
}

