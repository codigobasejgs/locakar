/** Conteúdo da landing comercial da Frota Easy. Só recursos que existem no código (auditado em 2026-11). */
import { PLATFORM as BRAND } from "@/lib/platform";

export const PLATFORM = {
  name: BRAND.name,
  slogan: BRAND.slogan,
  url: BRAND.siteUrl,
  signup: "/plataforma/cadastro",
  login: "/admin/login",
  trialDays: BRAND.trialDays,
  whatsapp: BRAND.whatsapp,
  seo: {
    title: "Frota Easy | Sistema para locadoras de veículos",
    description:
      "Frota Easy: sistema completo para locadoras de veículos. Frota, contratos com assinatura digital, cobranças automáticas por Pix, boleto e cartão, Copiloto no WhatsApp e aplicativo do locatário com a marca da sua locadora.",
  },
} as const;

export const waLink = (message: string) => `https://wa.me/${PLATFORM.whatsapp.e164}?text=${encodeURIComponent(message)}`;

export const WA = {
  know: waLink("Olá! Quero conhecer o Frota Easy, sistema para locadoras de veículos."),
  demo: waLink("Olá! Gostaria de agendar uma demonstração ao vivo do Frota Easy para a minha locadora."),
  proposal: waLink("Olá! Gostaria de receber uma proposta do Frota Easy para a minha locadora."),
} as const;

export const NAV = [
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#copiloto", label: "Copiloto WhatsApp" },
  { href: "#automacoes", label: "Automações" },
  { href: "#app", label: "App do Locatário" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
] as const;

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Como funciona a implantação?",
    a: `Você cria a conta da sua locadora e um passo a passo guiado ajuda a configurar marca, dados da empresa, meios de pagamento e contrato. Dá para começar a operar no mesmo dia, com ${PLATFORM.trialDays} dias de acesso gratuito.`,
  },
  {
    q: "Consigo migrar minha frota sem digitar tudo?",
    a: "Sim. O cadastro lê o PDF do CRLV-e e preenche placa, chassi, RENAVAM, modelo e ano; a Tabela FIPE completa marca, versão e valor. A importação em massa por planilha ainda não está disponível.",
  },
  {
    q: "Como funciona o Copiloto no WhatsApp?",
    a: "Você conecta um número de WhatsApp e administra a locadora conversando com ele: baixas de parcelas, cobranças, consultas e relatórios por botões, sem precisar de IA. Opcionalmente, a IA lê áudios, fotos de notas de oficina e PDFs. O mesmo número pode atender seus clientes com autoatendimento: 2ª via, pagamento, ocorrências e documentos.",
  },
  {
    q: "Quais meios de pagamento posso usar?",
    a: "Asaas (Pix, boleto e cartão), InfinitePay (link e maquininha por aproximação), Mercado Pago, PagBank, Pagar.me (Stone) e Pix por QR Code com comprovante. Cada locadora conecta as próprias contas e o dinheiro cai direto na sua conta, com baixa automática.",
  },
  {
    q: "Meus clientes têm um aplicativo?",
    a: "Sim. O locatário acompanha a locação, paga parcelas, envia comprovantes e documentos, faz vistoria guiada com fotos e assinatura na tela, abre ocorrências e pede reservas — tudo com o nome, o logo e as cores da sua locadora.",
  },
  {
    q: "Os dados da minha locadora ficam separados das outras?",
    a: "Sim. Cada locadora é isolada no banco de dados com regras de acesso por linha (RLS). Credenciais de pagamento ficam cifradas e nunca voltam ao navegador. Cada pessoa da equipe tem um papel: dono, administrador, financeiro, operador ou somente leitura.",
  },
  {
    q: "Posso usar meu próprio contrato?",
    a: "Sim. Envie seu modelo em PDF ou DOCX: a IA identifica os campos variáveis uma vez, você revisa, e cada contrato sai preenchido com os dados do cliente, do veículo e da locação, pronto para assinatura eletrônica com validade jurídica (Autentique).",
  },
  {
    q: "Funciona para carros e motos?",
    a: "Sim. A frota aceita carros, motos e outros tipos de veículo, com placa, documentos, fotos, hodômetro, licenciamento, IPVA, manutenções, multas e rastreamento.",
  },
  {
    q: "Como é o suporte?",
    a: "Atendimento pelo WhatsApp com a equipe Frota Easy, além da Central de Ajuda com artigos e tours guiados dentro do próprio painel.",
  },
];
