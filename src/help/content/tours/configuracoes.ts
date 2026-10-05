import type { TourDef } from "../../types";

/** Configurações em subtours curtos, um por aba: nada de um balão gigante com tudo. */
const base = { kind: "configuracao" as const, version: 1 };

export const configuracoes: TourDef[] = [
  {
    ...base, id: "settings-empresa", title: "Configurações: Empresa", module: "empresa", route: "/admin/settings#empresa", permission: "settings", minutes: 2,
    description: "Link público da locadora e dados da empresa.", article: "configurar-empresa-dados",
    keywords: ["empresa", "cnpj", "endereco", "dados", "link", "vitrine"], aliases: ["dados da empresa", "alterar cnpj", "link da locadora"],
    learn: ["divulgar o link da locadora", "preencher os dados da empresa"], next: "settings-aparencia",
    steps: [
      { id: "tabs", title: "Abas de Configurações", content: "As configurações são divididas em abas: Empresa, Aparência, Equipe, Textos, Contratos, Pagamentos, Integrações e Preferências. Cada aba tem seu próprio treinamento.", target: "settings-tabs", quick: true },
      { id: "share", title: "Link da sua locadora", content: "A página pública da {org} e o link direto do aplicativo. Copie e envie aos clientes ou coloque no Instagram e no WhatsApp.", target: "settings-share", quick: true },
      { id: "company", title: "Dados da empresa", content: "Nome fantasia (obrigatório), razão social, CNPJ ou CPF, contatos, site e endereço. Esses dados aparecem para o cliente e no painel. Salve com \"Salvar dados\".", target: "settings-company", quick: true },
    ],
  },
  {
    ...base, id: "settings-aparencia", title: "Configurações: Aparência e marca", module: "aparencia", route: "/admin/settings#aparencia", permission: "settings", minutes: 2,
    description: "Logo, cores e tema do painel e do aplicativo.", article: "configurar-identidade-visual",
    keywords: ["logo", "cores", "marca", "tema", "white label", "aparencia"], aliases: ["trocar logo", "mudar cores", "alterar tema escuro"],
    learn: ["enviar logos", "escolher as cores da marca", "trocar entre tema claro e escuro"], next: "settings-equipe",
    steps: [
      { id: "branding", title: "Sua marca", content: "Envie a logo para fundo escuro, a logo para fundo claro e o ícone compacto, defina o nome exibido e as cores principal, secundária e de destaque. O painel e o aplicativo do cliente passam a usar a identidade da {org}.", target: "settings-branding", quick: true },
      { id: "theme", title: "Tema do painel", content: "Claro ou escuro, só para você e neste navegador. Tabelas compactas mostram mais linhas por tela.", target: "settings-theme" },
    ],
  },
  {
    ...base, id: "settings-equipe", title: "Configurações: Equipe", module: "equipe", route: "/admin/settings#equipe", permission: "team", minutes: 2,
    description: "Convidar funcionários e escolher o que cada um pode fazer.", article: "gerenciar-equipe-permissoes",
    keywords: ["equipe", "funcionario", "usuario", "convite", "permissao", "acesso"], aliases: ["convidar funcionario", "dar acesso", "remover usuario"],
    learn: ["convidar alguém para a equipe", "entender as funções", "remover um acesso"], next: "settings-contratos",
    steps: [
      { id: "team", title: "Quem acessa o painel", content: "Convide pelo e-mail e escolha a função: Administrador (tudo), Gerente (operação e financeiro), Financeiro, Operador (locações, clientes, veículos) ou Somente leitura. \"Remover\" tira o acesso da pessoa a esta locadora.", target: "settings-team", quick: true },
    ],
  },
  {
    ...base, id: "settings-textos", title: "Configurações: Textos", module: "textos", route: "/admin/settings#textos", permission: "settings", minutes: 1,
    description: "Mensagens exibidas ao cliente.", article: "configurar-mensagens-textos",
    keywords: ["textos", "mensagem", "boas vindas", "rodape"], aliases: ["mudar mensagem do app"],
    learn: ["personalizar as mensagens do aplicativo e das cobranças"],
    steps: [
      { id: "texts", title: "Mensagens ao cliente", content: "Boas-vindas do aplicativo, observação nas cobranças, instruções de suporte e texto de rodapé. Escreva com a voz da {org}.", target: "settings-texts", quick: true },
    ],
  },
  {
    ...base, id: "settings-contratos", title: "Configurações: Contratos", module: "contratos", route: "/admin/settings#contratos", permission: "settings", feature: "contracts", minutes: 3,
    description: "Modelos de contrato e dados de quem assina pela locadora.", article: "modelos-contrato-ia",
    keywords: ["contrato", "modelo", "clausula", "assinatura", "docx", "pdf"], aliases: ["cadastrar modelo de contrato", "configurar contrato", "assinatura do representante"],
    learn: ["anexar e revisar um modelo de contrato", "preencher os dados do representante"], next: "settings-pagamentos",
    steps: [
      { id: "templates", title: "Modelos de contrato", content: "Anexe o seu contrato em PDF ou DOCX (até 5 modelos). O sistema lê e detecta os campos variáveis, como nome, CPF, placa e valores; você revisa e confirma onde cada informação entra. Depois disso, cada locação gera o contrato preenchido.", target: "settings-contract-templates", quick: true },
      { id: "signer", title: "Representante e cláusulas", content: "Razão social, CNPJ, endereço, quem assina pela locadora e a cidade do foro são obrigatórios para emitir contratos. Desenhe a assinatura do representante. As cláusulas gerais são usadas quando não há modelo próprio. Salve com \"Salvar alterações\" no topo.", target: "settings-contract-signer", quick: true },
    ],
  },
  {
    ...base, id: "settings-pagamentos", title: "Configurações: Pagamentos", module: "pagamentos", route: "/admin/settings#pagamentos", permission: "settings", feature: "payments", minutes: 4,
    description: "Formas de pagamento ativas, PIX, InfinitePay e Asaas.", article: "configurar-meios-pagamento",
    keywords: ["pagamento", "pix", "asaas", "infinitepay", "chave pix", "boleto", "cartao"], aliases: ["configurar pix", "ativar asaas", "como receber dos clientes"],
    learn: ["a diferença entre configurar e ativar", "configurar a chave PIX", "quando usar InfinitePay ou Asaas"], next: "settings-integracoes",
    steps: [
      { id: "methods", title: "Configurado x ativo", content: "Cada forma de pagamento tem dois estados. Configurada: os dados foram preenchidos. Ativa: o cliente pode usar. A chave liga e desliga na hora, para o painel e o aplicativo. Status possíveis: Ativo, Desativado, Não configurado e Erro de configuração.", target: "settings-payment-methods", quick: true },
      { id: "pix", title: "PIX manual", content: "O cliente paga direto na chave PIX da {org} e envia o comprovante. A equipe confere no extrato e aprova; só então a parcela fica paga. Informe tipo e chave, nome e cidade do recebedor.", target: "settings-pix", quick: true },
      { id: "infinitepay", title: "InfinitePay", content: "Receba por aproximação do cartão no celular (InfiniteTap) ou por link de pagamento PIX e cartão. Basta informar sua InfiniteTag e o modo.", target: "settings-infinitepay", article: "integracao-infinitepay" },
      { id: "asaas", title: "Asaas", content: "Gera cobranças com PIX, boleto e cartão e dá baixa automaticamente quando o cliente paga. Comece no ambiente de teste (Sandbox) e só troque para Produção depois de testar.", target: "settings-asaas", article: "integracao-asaas-cobrancas" },
    ],
  },
  {
    ...base, id: "settings-integracoes", title: "Configurações: Integrações", module: "integracoes", route: "/admin/settings#integracoes", permission: "integrations", minutes: 3,
    description: "Tabela FIPE, rastreamento, WhatsApp e e-mails.", article: "configurar-whatsapp-notificacoes",
    keywords: ["integracao", "fipe", "whatsapp", "email", "selsyn", "rastreamento"], aliases: ["conectar whatsapp", "ativar fipe", "configurar email"],
    learn: ["ativar a Tabela FIPE", "conectar o WhatsApp das notificações", "testar o envio de e-mails"], next: "settings-preferencias",
    steps: [
      { id: "fipe", title: "Tabela FIPE", content: "Mantém o valor de referência dos carros atualizado todo mês. Funciona no modo público; um token próprio é opcional.", target: "settings-fipe", feature: "fipe", article: "configurar-tabela-fipe" },
      { id: "selsyn", title: "Rastreamento", content: "Mostra se o rastreamento Selsyn está configurado e permite verificar as permissões da credencial.", target: "settings-selsyn", feature: "tracking" },
      { id: "whatsapp", title: "WhatsApp das notificações", content: "Conecte um número lendo o QR Code com o WhatsApp do celular. Por ele saem contratos, cobranças, comprovantes e alertas aos clientes. Envie um teste para conferir.", target: "settings-whatsapp", quick: true },
      { id: "email", title: "E-mails", content: "Contratos, termos de vistoria, comprovantes e multas também saem por e-mail com a identidade da {org}. Envie um teste para conferir.", target: "settings-email", quick: true },
    ],
  },
  {
    ...base, id: "settings-preferencias", title: "Configurações: Preferências e notificações", module: "notificacoes", route: "/admin/settings#preferencias", permission: "settings", minutes: 2,
    description: "Quem recebe os alertas e quais notificações chegam no navegador e no celular.", article: "notificacoes-web-push-alertas",
    keywords: ["alerta", "notificacao", "push", "resumo diario", "preferencias"], aliases: ["ativar notificacoes", "receber alertas no celular"],
    learn: ["definir onde chegam os alertas", "ativar as notificações no navegador ou celular"],
    steps: [
      { id: "alerts", title: "Alertas para a locadora", content: "E-mail e WhatsApp que recebem os avisos importantes. Escolha receber na hora (contrato assinado, pagamento, nova multa) e/ou o resumo diário às 8h.", target: "settings-alerts", quick: true },
      { id: "push", title: "Notificações da equipe", content: "Ative as notificações neste aparelho para receber os avisos do sino mesmo com o painel fechado. Escolha os vencimentos e categorias que interessam. Salve com \"Salvar alterações\" no topo.", target: "settings-push", quick: true },
    ],
  },
];
