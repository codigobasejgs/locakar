import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarRange,
  Camera,
  Car,
  ClipboardCheck,
  FileSignature,
  FileText,
  Gauge,
  KeyRound,
  Laptop as LaptopIcon,
  Lock,
  Mail,
  MessageCircle,
  Monitor,
  Palette,
  QrCode,
  Receipt,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Tablet,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import { Reveal } from "@/components/landing/reveal";
import { FAQ, PLATFORM, WA } from "./content";
import { BrowserFrame, Laptop, Phone, Shot } from "./devices";
import { BrandSwitcher, ThemeCompare, TrackedLink, ViewTracker } from "./interactive";

/* ---------- Blocos de composição ---------- */

function Container({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

function Heading({ eyebrow, title, text, center = false }: { eyebrow: string; title: string; text?: string; center?: boolean }) {
  return (
    <Reveal className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="pl-eyebrow">{eyebrow}</p>
      <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {text && <p className="pl-text-2 mt-4 text-base leading-relaxed text-pretty sm:text-lg">{text}</p>}
    </Reveal>
  );
}

function Checks({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
      {items.map((i) => (
        <li key={i} className="pl-text-2 flex items-start gap-2.5 text-[15px] leading-snug">
          <BadgeCheck className="pl-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {i}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Hero ---------- */

export function Hero() {
  return (
    <section id="produto" className="relative overflow-hidden">
      <div className="pl-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pl-glow pointer-events-none absolute -right-40 top-10 size-[38rem] max-w-full" aria-hidden="true" />
      <Container className="relative grid items-center gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1fr_1.15fr] lg:gap-10 lg:pb-24 lg:pt-20">
        <div>
          <p className="pl-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
            <span className="size-1.5 rounded-full bg-[var(--pl-accent)]" aria-hidden="true" />
            Software para locadoras de veículos
          </p>
          <h1 className="font-display mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-balance sm:text-5xl lg:text-[3.4rem]">
            Sua locadora inteira em um só sistema.
          </h1>
          <p className="pl-text-2 mt-5 max-w-xl text-lg leading-relaxed text-pretty">
            Gerencie frota, clientes, locações, contratos, cobranças, manutenções e muito mais — com um aplicativo personalizado para seus locatários.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <TrackedLink href={WA.know} event="hero_cta_clicked" params={{ place: "hero" }} className="pl-btn pl-btn-primary">
              Quero conhecer o sistema <ArrowRight className="size-4" aria-hidden="true" />
            </TrackedLink>
            <a href="#funcionalidades" className="pl-btn pl-btn-ghost">
              Ver funcionalidades
            </a>
          </div>
          <p className="pl-muted mt-5 text-sm">
            {PLATFORM.trialDays} dias de acesso gratuito ·{" "}
            <TrackedLink href={WA.demo} event="demo_requested" params={{ place: "hero" }} className="pl-link">
              Agendar demonstração
            </TrackedLink>
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-2xl lg:max-w-none">
          <Laptop className="pl-float">
            <Shot name="dashboard" themed alt="Dashboard do painel administrativo com indicadores da frota, faturamento e locações" width={1600} height={1000} sizes="(min-width: 1024px) 620px, 92vw" eager />
          </Laptop>
          <Phone className="pl-float-delay absolute -bottom-6 right-0 w-[30%] min-w-[104px] max-w-[190px] sm:-right-2">
            <Shot name="app-inicio" themed alt="Tela inicial do aplicativo do locatário com a locação em andamento" width={780} height={1688} sizes="190px" />
          </Phone>
          <div className="pl-glass pl-shadow absolute -left-3 bottom-[14%] hidden rounded-xl px-3.5 py-2.5 sm:block">
            <p className="pl-muted text-[11px] font-semibold uppercase tracking-wider">White label</p>
            <p className="text-sm font-semibold">Sua marca no painel e no app</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------- Prova visual ---------- */

export function VisualProof() {
  const pillars = [
    { icon: LaptopIcon, title: "Admin completo", text: "Frota, clientes, locações, cobranças, financeiro, manutenção e multas em um painel." },
    { icon: Smartphone, title: "App do locatário", text: "Seu cliente acompanha a locação, paga parcelas e envia documentos pelo celular." },
    { icon: Palette, title: "White label", text: "Nome, logo e cores da sua locadora em toda a experiência do cliente." },
  ];
  return (
    <section className="pl-bg-2 border-y pl-line py-20 sm:py-24">
      <Container>
        <Heading center eyebrow="Visão geral" title="Tudo o que sua locadora precisa." text="Telas reais do sistema, com dados de demonstração." />
        <Reveal className="mt-12">
          <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
            <BrowserFrame label="Painel · Financeiro">
              <Image src="/plataforma/finance-dark.webp" alt="Tela Financeiro com receitas, despesas, saldo e gráficos mensais" width={1600} height={1000} sizes="(min-width: 1024px) 800px, 100vw" loading="lazy" className="h-auto w-full" />
            </BrowserFrame>
            <Phone className="mx-auto w-48 sm:w-56">
              <Shot name="app-pagamentos" themed alt="Lista de parcelas no aplicativo do locatário, com status pago, vencido e a pagar" width={780} height={1688} sizes="224px" />
            </Phone>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08} className="pl-surface pl-lift rounded-2xl border pl-line p-6">
              <p.icon className="pl-accent size-6" aria-hidden="true" />
              <h3 className="font-display mt-4 text-lg font-semibold">{p.title}</h3>
              <p className="pl-text-2 mt-2 text-[15px] leading-relaxed">{p.text}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- White label ---------- */

export function WhiteLabel() {
  return (
    <section id="white-label" className="py-20 sm:py-24">
      <Container>
        <Heading center eyebrow="White label" title="Seu sistema. Sua marca." text="Personalize a plataforma com o nome, logo, cores e dados da sua locadora." />
        <div className="mx-auto mt-6 flex max-w-xl flex-wrap items-center justify-center gap-2 text-xs font-semibold">
          <span className="pl-chip rounded-full px-3 py-1">Plataforma</span>
          <ArrowRight className="pl-muted size-3.5" aria-hidden="true" />
          {["Locadora A", "Locadora B", "Locadora C"].map((l) => (
            <span key={l} className="pl-surface rounded-full border pl-line px-3 py-1">
              {l}
            </span>
          ))}
        </div>
        <Reveal className="mx-auto mt-10 max-w-4xl">
          <BrandSwitcher />
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- Módulos de operação ---------- */

type Module = { id: string; eyebrow: string; title: string; text: string; items: string[]; img: string; alt: string; icon: typeof Car };

const MODULES: Module[] = [
  {
    id: "frota",
    icon: Car,
    eyebrow: "Gestão de frota",
    title: "Cada veículo, com documentos e histórico.",
    text: "Carros, motos e outros tipos em um cadastro só, com leitura automática do CRLV-e.",
    items: ["Placa, Renavam e chassi", "Documentos e fotos", "Hodômetro e status", "Licenciamento e IPVA", "Disponibilidade da frota", "Visão 360° de cada veículo"],
    img: "vehicles-dark",
    alt: "Lista de veículos com placa, hodômetro, licenciamento, valor de compra e status",
  },
  {
    id: "locacoes",
    icon: KeyRound,
    eyebrow: "Locações",
    title: "Do contrato à devolução, sem planilha.",
    text: "Locações diárias, semanais, quinzenais ou mensais com parcelas geradas automaticamente.",
    items: ["Períodos e valores", "Caução", "Parcelas com multa e juros", "Vistoria de entrega e devolução", "Status e atrasos", "Histórico por locatário"],
    img: "rentals-dark",
    alt: "Tela de locações com locatário, veículo, período e status",
  },
  {
    id: "reservas",
    icon: CalendarRange,
    eyebrow: "Reservas",
    title: "Agenda da frota sem conflito de datas.",
    text: "O sistema impede duas reservas para o mesmo veículo no mesmo período.",
    items: ["Período e disponibilidade", "Cliente e veículo", "Pedidos feitos pelo app", "Confirmação e cancelamento"],
    img: "reservations-dark",
    alt: "Tela de reservas com cliente, veículo, período e status",
  },
  {
    id: "clientes",
    icon: UserRound,
    eyebrow: "Clientes",
    title: "Cadastro completo, com alerta de CNH.",
    text: "Dados, documentos e histórico de cada locatário em um só lugar.",
    items: ["CPF, telefone e endereço", "CNH com vencimento", "Documentos enviados pelo app", "Histórico de locações"],
    img: "clients-dark",
    alt: "Lista de clientes com contato e situação da CNH",
  },
];

export function Modules() {
  return (
    <section id="funcionalidades" className="pl-bg-2 border-y pl-line py-20 sm:py-24">
      <ViewTracker event="features_viewed" />
      <Container>
        <Heading eyebrow="Operação" title="O dia a dia da locadora, organizado." text="Cada módulo conversa com os outros: a locação gera as parcelas, a parcela alimenta o financeiro, o veículo guarda o histórico." />
        <div className="mt-14 grid gap-16 sm:gap-20">
          {MODULES.map((m, i) => (
            <div key={m.id} id={m.id} className="grid scroll-mt-24 items-center gap-8 lg:grid-cols-2 lg:gap-12">
              <Reveal className={i % 2 ? "lg:order-2" : ""}>
                <m.icon className="pl-accent size-6" aria-hidden="true" />
                <p className="pl-eyebrow mt-4">{m.eyebrow}</p>
                <h3 className="font-display mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{m.title}</h3>
                <p className="pl-text-2 mt-3 text-base leading-relaxed">{m.text}</p>
                <Checks items={m.items} />
              </Reveal>
              <Reveal delay={0.1}>
                <BrowserFrame label={`Painel · ${m.eyebrow}`}>
                  <Image src={`/plataforma/${m.img}.webp`} alt={m.alt} width={1600} height={1000} sizes="(min-width: 1024px) 540px, 100vw" loading="lazy" className="h-auto w-full" />
                </BrowserFrame>
              </Reveal>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Contratos inteligentes ---------- */

export function SmartContracts() {
  const steps = [
    { icon: FileText, title: "Você envia seu modelo", text: "PDF ou DOCX do contrato que você já usa." },
    { icon: ScanLine, title: "O sistema identifica os campos", text: "A IA lê o modelo uma única vez e sugere cada campo." },
    { icon: ClipboardCheck, title: "Você revisa e aprova", text: "Confirme ou ajuste o vínculo de cada campo." },
    { icon: Users, title: "Cliente + veículo + locação", text: "Na emissão, os dados vêm do cadastro, sem IA." },
    { icon: FileSignature, title: "Contrato preenchido", text: "Faltou CPF ou endereço? O sistema avisa antes." },
    { icon: Camera, title: "Assinatura eletrônica", text: "Link para o cliente assinar com selfie e assinatura na tela." },
  ];
  return (
    <section id="contratos" className="relative overflow-hidden py-20 sm:py-24">
      <div className="pl-glow pointer-events-none absolute -left-40 top-20 size-[32rem] max-w-full" aria-hidden="true" />
      <Container className="relative">
        <Heading center eyebrow="Contratos inteligentes" title="Seu contrato preenchido automaticamente." text="Você mantém seu próprio modelo de contrato. O sistema só preenche os dados." />
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="list-none">
              <Reveal delay={i * 0.06} className="pl-surface pl-lift relative h-full rounded-2xl border pl-line p-6">
                <div className="flex items-center justify-between">
                  <s.icon className="pl-accent size-6" aria-hidden="true" />
                  <span className="pl-muted font-display text-sm font-semibold tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="font-display mt-4 font-semibold">{s.title}</h3>
                <p className="pl-text-2 mt-1.5 text-[15px] leading-relaxed">{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <p className="pl-muted mx-auto mt-8 max-w-2xl text-center text-sm">
          O texto do contrato fica congelado com código de integridade (SHA-256) no momento da emissão. Até 5 modelos, um por tipo de locação.
        </p>
      </Container>
    </section>
  );
}

/* ---------- Pagamentos + PIX manual ---------- */

export function Payments() {
  const providers = [
    { name: "Asaas", text: "Cobranças por Pix, boleto e cartão. A baixa acontece sozinha quando o pagamento é confirmado.", tag: "Opcional" },
    { name: "InfinitePay", text: "Link de pagamento e cobrança por aproximação no celular, com confirmação automática.", tag: "Opcional" },
    { name: "PIX QR Code", text: "QR Code da sua chave Pix. O cliente paga e envia o comprovante pelo app.", tag: "Opcional" },
  ];
  const pixFlow = ["QR Code na parcela", "Cliente paga", "Envia comprovante", "Equipe analisa", "Aprova", "Parcela baixada"];
  return (
    <section id="pagamentos" className="pl-bg-2 border-y pl-line py-20 sm:py-24">
      <Container>
        <Heading eyebrow="Pagamentos" title="Você escolhe quais meios oferecer." text="Ative um, dois ou os três. Cada parcela da locação pode ser cobrada pelo meio que fizer mais sentido." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {providers.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.06} className="pl-surface rounded-2xl border pl-line p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                <span className="pl-chip rounded-full px-2.5 py-0.5 text-xs font-semibold">{p.tag}</span>
              </div>
              <p className="pl-text-2 mt-3 text-[15px] leading-relaxed">{p.text}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="pl-surface mt-10 rounded-2xl border pl-line p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <QrCode className="pl-accent size-6" aria-hidden="true" />
            <h3 className="font-display text-lg font-semibold">PIX manual com comprovante</h3>
          </div>
          <ol className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {pixFlow.map((s, i) => (
              <li key={s} className="pl-surface-2 rounded-xl border pl-line p-3.5">
                <span className="pl-accent font-display text-xs font-semibold tabular-nums">{i + 1}</span>
                <p className="mt-1 text-sm font-semibold leading-snug">{s}</p>
              </li>
            ))}
          </ol>
          <p className="pl-muted mt-4 text-sm">Comprovantes repetidos em pagamentos diferentes são sinalizados para a equipe.</p>
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- Financeiro, manutenção, multas, vistoria ---------- */

export function Operations() {
  const cards = [
    {
      icon: Wallet,
      title: "Financeiro",
      items: ["Receitas e despesas", "Saldo e fluxo mensal", "Recebimentos pendentes", "Despesas por categoria"],
      img: "finance-dark",
      alt: "Financeiro com receitas, despesas, saldo e gráficos",
    },
    {
      icon: Wrench,
      title: "Manutenção",
      items: ["Histórico por veículo", "KM atual e próxima troca", "Fornecedor e valor", "Aviso ao locatário"],
      img: "maintenance-dark",
      alt: "Manutenções com data, placa, descrição, quilometragem e valor",
    },
    {
      icon: Receipt,
      title: "Multas",
      items: ["Locatário e veículo", "Infração e vencimento", "Prazo de identificação", "Valor e status"],
      img: "fines-dark",
      alt: "Multas com auto de infração, veículo, vencimento, valor e status",
    },
  ];
  const inspection = ["Entrega e devolução", "KM e combustível", "Checklist de itens", "Danos e observações", "Assinatura do cliente na tela", "Fotos pelo app do locatário"];
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <Heading eyebrow="Controle" title="Dinheiro, oficina e infrações sob controle." />
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {cards.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.06} className="pl-surface pl-lift flex flex-col overflow-hidden rounded-2xl border pl-line">
              <div className="p-6">
                <c.icon className="pl-accent size-6" aria-hidden="true" />
                <h3 className="font-display mt-3 text-lg font-semibold">{c.title}</h3>
                <ul className="pl-text-2 mt-3 grid gap-1.5 text-[15px]">
                  {c.items.map((it) => (
                    <li key={it} className="flex items-start gap-2">
                      <BadgeCheck className="pl-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto border-t pl-line">
                <Image src={`/plataforma/${c.img}.webp`} alt={c.alt} width={1600} height={1000} sizes="(min-width: 1024px) 360px, 100vw" loading="lazy" className="h-auto w-full" />
              </div>
            </Reveal>
          ))}
        </div>

        <div id="vistoria" className="scroll-mt-24"><Reveal className="pl-surface mt-6 grid gap-6 rounded-2xl border pl-line p-6 sm:p-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <ClipboardCheck className="pl-accent size-6" aria-hidden="true" />
            <h3 className="font-display mt-3 text-xl font-semibold">Vistoria</h3>
            <p className="pl-text-2 mt-2 text-[15px] leading-relaxed">Registro de check-out e check-in feito pela equipe, com assinatura do cliente. O locatário também pode fazer vistoria pelo app, com fotos.</p>
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {inspection.map((it) => (
              <li key={it} className="pl-surface-2 flex items-center gap-2.5 rounded-xl border pl-line px-3.5 py-3 text-sm font-medium">
                <BadgeCheck className="pl-accent size-4 shrink-0" aria-hidden="true" />
                {it}
              </li>
            ))}
          </ul>
        </Reveal></div>
      </Container>
    </section>
  );
}

/* ---------- App do locatário + branding do app ---------- */

export function TenantApp() {
  const features = [
    "Locação em andamento",
    "Parcelas e pagamentos",
    "Envio de comprovante",
    "Veículo e manutenções",
    "Vistoria com fotos",
    "Documentos (CNH, endereço)",
    "Contrato e condições",
    "Multas",
    "Pedido de reserva",
    "Relato de ocorrência",
    "Notificações",
    "Suporte por WhatsApp",
  ];
  return (
    <section id="app" className="pl-bg-2 relative overflow-hidden border-y pl-line py-20 sm:py-24">
      <div className="pl-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <Container className="relative grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Heading eyebrow="App do locatário" title="Seu cliente também tem um aplicativo." text="Menos mensagens perguntando valor e vencimento: o locatário resolve sozinho, pelo celular." />
          <Checks items={features} />
          <div className="pl-surface mt-8 rounded-2xl border pl-line p-5">
            <p className="font-display font-semibold">O locatário interage com a identidade da sua empresa.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              {["Logo da sua locadora", "Cores da sua locadora", "Dados da sua empresa"].map((t) => (
                <span key={t} className="pl-chip rounded-full px-3 py-1">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Reveal className="relative mx-auto flex w-full max-w-md items-end justify-center gap-4">
          <Phone className="w-[46%] translate-y-6">
            <Shot name="app-locacao" themed alt="Tela Minha locação no app, com veículo, contrato, caução e parcelas" width={780} height={1688} sizes="210px" />
          </Phone>
          <Phone className="w-[50%]">
            <Shot name="app-inicio" themed alt="Tela inicial do app com aviso de pagamento vencido e botão Pagar com PIX" width={780} height={1688} sizes="230px" />
          </Phone>
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- Notificações, FIPE, relatórios ---------- */

export function Insights() {
  const alerts = ["Parcelas vencendo e vencidas", "Pagamentos recebidos", "Comprovantes e documentos para aprovar", "Manutenções programadas", "CNH perto do vencimento", "Contratos assinados", "Multas e prazos", "Devoluções e reservas"];
  const reports = ["Frota", "Locações", "Receitas", "Despesas", "Manutenção", "Multas", "Reservas"];
  return (
    <section className="py-20 sm:py-24">
      <Container className="grid gap-6 lg:grid-cols-2">
        <Reveal className="pl-surface rounded-2xl border pl-line p-6 sm:p-8">
          <Bell className="pl-accent size-6" aria-hidden="true" />
          <h3 className="font-display mt-3 text-xl font-semibold">Notificações</h3>
          <p className="pl-text-2 mt-2 text-[15px]">Avisos no navegador e no celular para a equipe, lembretes por e-mail e WhatsApp para o locatário.</p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {alerts.map((a) => (
              <li key={a} className="pl-text-2 flex items-start gap-2 text-sm">
                <BadgeCheck className="pl-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {a}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="pl-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1"><Bell className="size-3.5" aria-hidden="true" />Push</span>
            <span className="pl-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1"><Mail className="size-3.5" aria-hidden="true" />E-mail</span>
            <span className="pl-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1"><MessageCircle className="size-3.5" aria-hidden="true" />WhatsApp</span>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="pl-surface rounded-2xl border pl-line p-6 sm:p-8">
          <span id="fipe" className="block scroll-mt-24" aria-hidden="true" />
          <TrendingUp className="pl-accent size-6" aria-hidden="true" />
          <h3 className="font-display mt-3 text-xl font-semibold">Valor da sua frota sempre à vista.</h3>
          <p className="pl-text-2 mt-2 text-[15px]">Integração com a Tabela FIPE: vincule a versão de cada veículo e acompanhe o valor de referência mês a mês.</p>
          <dl className="mt-5 grid grid-cols-2 gap-3">
            {[
              ["Valor FIPE", "por veículo"],
              ["Histórico", "mensal"],
              ["Variação", "no período"],
              ["Frota", "valor estimado total"],
            ].map(([k, v]) => (
              <div key={k} className="pl-surface-2 rounded-xl border pl-line p-3.5">
                <dt className="font-display font-semibold">{k}</dt>
                <dd className="pl-muted text-sm">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="pl-muted mt-4 text-xs">Atualização automática mensal opcional. Valor de referência, não representa preço de venda.</p>
        </Reveal>

        <Reveal className="lg:col-span-2">
          <div className="pl-surface grid items-center gap-6 rounded-2xl border pl-line p-6 sm:p-8 lg:grid-cols-[1fr_1.5fr]">
            <div>
              <Gauge className="pl-accent size-6" aria-hidden="true" />
              <h3 className="font-display mt-3 text-xl font-semibold">Relatórios</h3>
              <p className="pl-text-2 mt-2 text-[15px]">Filtros por mês, período, veículo e status, com gráfico e exportação em CSV.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {reports.map((r) => (
                  <span key={r} className="pl-surface-2 rounded-full border pl-line px-3 py-1 text-xs font-semibold">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            <BrowserFrame label="Painel · Relatórios">
              <Shot name="reports" themed alt="Relatório de locações com gráfico de status, filtros e tabela" width={1600} height={1000} sizes="(min-width: 1024px) 640px, 100vw" />
            </BrowserFrame>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- Claro/escuro + responsivo ---------- */

export function Experience() {
  return (
    <section className="pl-bg-2 border-y pl-line py-20 sm:py-24">
      <Container>
        <Heading center eyebrow="Tema claro e escuro" title="Do jeito que sua equipe prefere trabalhar." text="Cada pessoa escolhe o tema do painel. O app do locatário também tem os dois." />
        <Reveal className="mx-auto mt-10 max-w-4xl">
          <ThemeCompare />
        </Reveal>

        <div className="mt-24">
          <Heading center eyebrow="Responsivo" title="Trabalhe de onde estiver." text="O mesmo painel no computador, no tablet e no celular — também instalável como aplicativo." />
          <Reveal className="mt-12 flex items-end justify-center gap-3 sm:gap-6">
            <div className="hidden w-[52%] md:block">
              <Laptop>
                <Shot name="dashboard" themed alt="Painel no computador" width={1600} height={1000} sizes="520px" />
              </Laptop>
              <p className="pl-muted mt-3 flex items-center justify-center gap-1.5 text-sm"><Monitor className="size-4" aria-hidden="true" />Desktop</p>
            </div>
            <div className="w-[48%] max-w-[260px] md:w-[22%]">
              <div className="pl-phone pl-shadow !rounded-[1.4rem]">
                <div className="!rounded-[1rem]">
                  <Image src="/plataforma/dashboard-dark-tab.webp" alt="Painel no tablet" width={1230} height={1770} sizes="260px" loading="lazy" className="pl-dark-only h-auto w-full" />
                  <Image src="/plataforma/dashboard-light-tab.webp" alt="Painel no tablet" width={1230} height={1770} sizes="260px" loading="lazy" className="pl-light-only h-auto w-full" />
                </div>
              </div>
              <p className="pl-muted mt-3 flex items-center justify-center gap-1.5 text-sm"><Tablet className="size-4" aria-hidden="true" />Tablet</p>
            </div>
            <div className="w-[38%] max-w-[180px] md:w-[15%]">
              <Phone>
                <Image src="/plataforma/dashboard-dark-mob.webp" alt="Painel no celular" width={780} height={1688} sizes="180px" loading="lazy" className="pl-dark-only h-auto w-full" />
                <Image src="/plataforma/dashboard-light-mob.webp" alt="Painel no celular" width={780} height={1688} sizes="180px" loading="lazy" className="pl-light-only h-auto w-full" />
              </Phone>
              <p className="pl-muted mt-3 flex items-center justify-center gap-1.5 text-sm"><Smartphone className="size-4" aria-hidden="true" />Celular</p>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ---------- Segurança ---------- */

export function Security() {
  const items = [
    { icon: ShieldCheck, title: "Isolamento por locadora", text: "Cada locadora tem seus próprios dados. As regras de acesso ficam no banco de dados, não só na tela." },
    { icon: Users, title: "Permissões por função", text: "Proprietário, administrador, financeiro, operador ou somente leitura: cada pessoa vê o que precisa." },
    { icon: Lock, title: "Armazenamento protegido", text: "Documentos, comprovantes e fotos de vistoria ficam em armazenamento privado, acessado por links temporários." },
    { icon: KeyRound, title: "Chaves cifradas", text: "Credenciais de integrações como Asaas são guardadas criptografadas e nunca vão para o navegador." },
  ];
  return (
    <section id="seguranca" className="py-20 sm:py-24">
      <Container>
        <Heading eyebrow="Segurança" title="Cada locadora, seus próprios dados." text="Como o sistema protege a sua operação e os dados dos seus clientes." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {items.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.06} className="pl-surface flex gap-4 rounded-2xl border pl-line p-6">
              <s.icon className="pl-accent size-6 shrink-0" aria-hidden="true" />
              <div>
                <h3 className="font-display font-semibold">{s.title}</h3>
                <p className="pl-text-2 mt-1.5 text-[15px] leading-relaxed">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="pl-muted mt-6 text-sm">Registro de auditoria das ações sensíveis e consentimento do locatário registrado conforme a LGPD.</p>
      </Container>
    </section>
  );
}

/* ---------- Integrações ---------- */

export function Integrations() {
  const list: { name: string; text: string; status: "Disponível" | "Opcional" | "Em breve" }[] = [
    { name: "Asaas", text: "Pix, boleto e cartão", status: "Opcional" },
    { name: "InfinitePay", text: "Link e aproximação", status: "Opcional" },
    { name: "PIX QR Code", text: "Chave Pix da locadora", status: "Opcional" },
    { name: "Tabela FIPE", text: "Valor de referência da frota", status: "Opcional" },
    { name: "WhatsApp", text: "Lembretes e confirmações", status: "Opcional" },
    { name: "E-mail", text: "Contratos, recibos e alertas", status: "Disponível" },
    { name: "Assinatura eletrônica", text: "Selfie e assinatura na tela", status: "Disponível" },
    { name: "Rastreamento (Selsyn)", text: "Posição e telemetria", status: "Em breve" },
  ];
  const tone = { Disponível: "pl-ok", Opcional: "pl-accent", "Em breve": "pl-signal" } as const;
  return (
    <section id="integracoes" className="pl-bg-2 border-y pl-line py-20 sm:py-24">
      <Container>
        <Heading center eyebrow="Integrações" title="Conecte só o que fizer sentido." text="Integrações opcionais, ativadas pela própria locadora em Configurações." />
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((it) => (
            <li key={it.name} className="pl-surface flex flex-col rounded-2xl border pl-line p-5">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${tone[it.status]}`}>{it.status}</span>
              <h3 className="font-display mt-2 font-semibold">{it.name}</h3>
              <p className="pl-muted mt-1 text-sm">{it.text}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ---------- Como funciona ---------- */

export function HowItWorks() {
  const steps = ["Cadastre sua locadora.", "Coloque sua marca.", "Cadastre sua frota.", "Configure contratos e pagamentos.", "Convide sua equipe.", "Comece a operar."];
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <Heading center eyebrow="Como funciona" title="Comece em poucos passos." />
        <ol className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s} className="list-none">
              <Reveal delay={i * 0.05} className="pl-surface flex h-full items-center gap-4 rounded-2xl border pl-line p-5">
                <span className="pl-chip font-display flex size-10 shrink-0 items-center justify-center rounded-xl text-base font-semibold tabular-nums">{i + 1}</span>
                <span className="font-semibold">{s}</span>
              </Reveal>
            </li>
          ))}
        </ol>
        <div className="mt-8 text-center">
          <TrackedLink href={PLATFORM.signup} event="hero_cta_clicked" params={{ place: "how" }} className="pl-btn pl-btn-primary">
            Criar minha locadora <ArrowRight className="size-4" aria-hidden="true" />
          </TrackedLink>
        </div>
      </Container>
    </section>
  );
}

/* ---------- Grid de funcionalidades ---------- */

export function FeatureGrid() {
  const groups = [
    { title: "Operação", items: ["Dashboard", "Frota", "Clientes", "Reservas", "Locações", "Solicitações pelo app"] },
    { title: "Financeiro", items: ["Pagamentos", "Financeiro", "Despesas", "Cobrança de parcelas", "Relatórios"] },
    { title: "Frota e risco", items: ["Manutenção", "Multas", "Vistoria", "Ocorrências", "Valor FIPE"] },
    { title: "Documentos", items: ["Contratos", "Assinatura eletrônica", "Documentos do cliente", "Recibos em PDF"] },
    { title: "Relacionamento", items: ["App do locatário", "Notificações", "WhatsApp", "E-mail"] },
    { title: "Plataforma", items: ["White label", "Equipe e permissões", "Integrações", "Tema claro e escuro"] },
  ];
  return (
    <section className="pl-bg-2 border-y pl-line py-20 sm:py-24">
      <Container>
        <Heading eyebrow="Funcionalidades" title="Tudo em um só lugar." />
        <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="pl-eyebrow">{g.title}</h3>
              <ul className="mt-3 grid gap-2">
                {g.items.map((it) => (
                  <li key={it} className="flex items-center gap-2.5 border-b pl-line pb-2 text-[15px] font-medium">
                    <BadgeCheck className="pl-accent size-4 shrink-0" aria-hidden="true" />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Planos ---------- */

export function Plans() {
  return (
    <section id="planos" className="py-20 sm:py-24">
      <ViewTracker event="pricing_viewed" />
      <Container>
        <Heading center eyebrow="Planos" title="Planos para cada momento da sua locadora." text="Estamos finalizando os pacotes. Fale com a gente e receba uma proposta para o tamanho da sua frota." />
        <Reveal className="pl-surface pl-shadow relative mx-auto mt-10 max-w-3xl overflow-hidden rounded-3xl border pl-line p-8 text-center sm:p-10">
          <div className="pl-glow pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2" aria-hidden="true" />
          <p className="pl-chip relative inline-flex rounded-full px-3 py-1 text-xs font-semibold">Teste sem compromisso</p>
          <p className="font-display relative mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            {PLATFORM.trialDays} dias grátis
          </p>
          <p className="pl-text-2 relative mx-auto mt-3 max-w-md">Acesso completo para configurar sua locadora e operar de verdade antes de decidir.</p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <TrackedLink href={WA.proposal} event="demo_requested" params={{ place: "plans" }} className="pl-btn pl-btn-primary">
              Solicitar proposta
            </TrackedLink>
            <TrackedLink href={PLATFORM.signup} event="hero_cta_clicked" params={{ place: "plans" }} className="pl-btn pl-btn-ghost">
              Criar minha locadora
            </TrackedLink>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ---------- FAQ ---------- */

export function Faq() {
  return (
    <section id="faq" className="pl-bg-2 border-y pl-line py-20 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <Heading eyebrow="Dúvidas" title="Perguntas frequentes" text="Não encontrou o que procurava? Fale com a gente pelo WhatsApp." />
        <div className="grid gap-3">
          {FAQ.map((f) => (
            <details key={f.q} className="pl-surface group rounded-2xl border pl-line px-5">
              <summary className="flex min-h-14 items-center justify-between gap-4 py-4 font-semibold">
                {f.q}
                <span className="pl-faq-icon pl-accent text-2xl leading-none transition-transform" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="pl-text-2 pb-5 text-[15px] leading-relaxed">{f.a}</p>
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
    <section className="relative overflow-hidden py-24">
      <div className="pl-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="pl-glow pointer-events-none absolute left-1/2 top-1/2 size-[36rem] max-w-full -translate-x-1/2 -translate-y-1/2" aria-hidden="true" />
      <Container className="relative text-center">
        <h2 className="font-display mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">Sua locadora pronta para o próximo nível.</h2>
        <p className="pl-text-2 mx-auto mt-5 max-w-xl text-lg">Centralize sua operação e ofereça uma experiência profissional aos seus clientes.</p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <TrackedLink href={WA.know} event="hero_cta_clicked" params={{ place: "final" }} className="pl-btn pl-btn-primary">
            Quero conhecer o sistema <ArrowRight className="size-4" aria-hidden="true" />
          </TrackedLink>
          <TrackedLink href={WA.know} event="whatsapp_clicked" params={{ place: "final" }} className="pl-btn pl-btn-ghost">
            <MessageCircle className="size-4" aria-hidden="true" /> Falar no WhatsApp
          </TrackedLink>
        </div>
        <p className="pl-muted mt-5 text-sm">
          WhatsApp <span className="select-all font-semibold">{PLATFORM.whatsapp.display}</span>
        </p>
      </Container>
    </section>
  );
}
