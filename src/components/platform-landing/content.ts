/** Conteúdo da landing comercial da plataforma. Só recursos que existem no código (auditado em 2026-10). */
export const PLATFORM = {
  name: "LOCAKAR SaaS",
  url: "https://www.locakar.com.br/plataforma",
  signup: "/plataforma/cadastro",
  trialDays: 30,
  whatsapp: { e164: "5519989615873", display: "(19) 98961-5873" },
  seo: {
    title: "LOCAKAR SaaS | Sistema de gestão para locadoras de veículos",
    description:
      "Software para locadora de veículos: frota, clientes, reservas, locações, contratos, cobranças, manutenção e multas, com aplicativo para o locatário na marca da sua locadora.",
  },
} as const;

export const waLink = (message: string) => `https://wa.me/${PLATFORM.whatsapp.e164}?text=${encodeURIComponent(message)}`;

export const WA = {
  know: waLink("Olá! Quero conhecer o LOCAKAR SaaS, sistema de gestão para locadoras de veículos."),
  demo: waLink("Olá! Gostaria de agendar uma demonstração do LOCAKAR SaaS para a minha locadora."),
  proposal: waLink("Olá! Gostaria de receber uma proposta do LOCAKAR SaaS para a minha locadora."),
} as const;

export const NAV = [
  { href: "#produto", label: "Produto" },
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#app", label: "App do locatário" },
  { href: "#integracoes", label: "Integrações" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
] as const;

export const FAQ: { q: string; a: string }[] = [
  {
    q: "O sistema funciona para pequenas locadoras?",
    a: "Sim. O painel foi desenhado a partir da operação de uma locadora real, com poucos veículos e locações semanais. Você usa apenas os módulos de que precisa; integrações são opcionais.",
  },
  {
    q: "Posso usar minha própria marca?",
    a: "Sim. Você configura nome, logo e cores da sua locadora. O painel, o aplicativo do locatário e os documentos enviados ao cliente passam a exibir a sua identidade.",
  },
  {
    q: "Meus clientes têm acesso ao aplicativo?",
    a: "Sim. O locatário acompanha a locação, as parcelas e os pagamentos, envia comprovantes e documentos, faz vistoria pelo celular, relata ocorrências, consulta multas e pede reservas — tudo com a marca da sua locadora.",
  },
  {
    q: "Posso usar meu próprio contrato?",
    a: "Sim. Você envia seu modelo em PDF ou DOCX. A IA identifica os campos variáveis uma única vez, você revisa e aprova, e a partir daí cada contrato é preenchido automaticamente com os dados do cliente, do veículo e da locação, sem IA na emissão.",
  },
  {
    q: "Quais formas de pagamento posso utilizar?",
    a: "Asaas (Pix, boleto e cartão), InfinitePay (link de pagamento e maquininha por aproximação) e PIX por QR Code com envio de comprovante. Você liga e desliga cada uma em Configurações.",
  },
  {
    q: "Posso gerenciar carros e motos?",
    a: "Sim. O cadastro de frota aceita carros, motos e outros tipos de veículo, com placa, documentos, fotos, hodômetro, licenciamento, IPVA e status de disponibilidade.",
  },
  {
    q: "Posso importar minha frota?",
    a: "O cadastro lê o PDF do CRLV-e e preenche os dados do veículo automaticamente, e a busca na Tabela FIPE completa marca, modelo e versão. Importação em massa por planilha ainda não está disponível.",
  },
  {
    q: "Como funciona a implantação?",
    a: `Você cria a conta da sua locadora, configura marca, dados da empresa, pagamentos e contrato em um passo a passo guiado e começa a operar. São ${PLATFORM.trialDays} dias de acesso gratuito para testar.`,
  },
  {
    q: "Meus funcionários podem acessar?",
    a: "Sim. Você convida a equipe por e-mail e define a função de cada pessoa, como administrador, financeiro, operador ou somente leitura.",
  },
  {
    q: "As integrações são opcionais?",
    a: "Sim. Asaas, InfinitePay, PIX, Tabela FIPE e WhatsApp são ativados por você, quando fizer sentido para a sua operação. O sistema funciona sem nenhuma delas.",
  },
];
