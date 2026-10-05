import type { TourDef } from "../../types";

/**
 * Jornadas por objetivo: atravessam telas na ordem real do trabalho. Só observam: abrem formulários vazios
 * para mostrar onde preencher, mas nunca salvam. Para criar de verdade, a pessoa usa a tela normalmente.
 */
export const jornadas: TourDef[] = [
  {
    id: "jornada-prepare-sua-locadora", title: "Prepare sua locadora", kind: "jornada", module: "primeiros-passos", route: "/admin/settings#empresa",
    permission: "settings", minutes: 4, version: 1, article: "onboarding-checklist-locadora",
    description: "Empresa, marca, pagamentos, contrato, equipe e primeiro veículo, na ordem certa.",
    keywords: ["configurar", "implantacao", "comecar", "preparar", "onboarding", "primeiros passos"],
    aliases: ["configurar minha locadora", "como comecar", "deixar o sistema pronto"],
    learn: ["onde preencher os dados da empresa", "onde colocar logo e cores", "onde ativar formas de pagamento", "onde configurar o contrato", "como convidar a equipe", "onde cadastrar o primeiro veículo"],
    next: "jornada-primeira-locacao",
    steps: [
      { id: "intro", title: "Vamos deixar tudo pronto", content: "Em poucos passos você vê onde configurar cada parte da {org}. O tour só mostra: preencha e salve cada tela quando quiser.", quick: true },
      { id: "empresa", route: "/admin/settings#empresa", title: "1. Dados da empresa", content: "Nome, CNPJ, contatos e endereço. Eles aparecem para o cliente e nos contratos.", target: "settings-company", quick: true },
      { id: "marca", route: "/admin/settings#aparencia", title: "2. Logo e cores", content: "Envie a logo e escolha as cores: o painel e o aplicativo do cliente passam a ter a cara da sua locadora.", target: "settings-branding", quick: true },
      { id: "pagamentos", route: "/admin/settings#pagamentos", title: "3. Como você vai receber", content: "Ative pelo menos uma forma de pagamento. O mais simples para começar é o PIX manual: cadastre a chave e ative.", target: "settings-payment-methods", feature: "payments", quick: true },
      { id: "contrato", route: "/admin/settings#contratos", title: "4. Contrato", content: "Preencha quem assina pela locadora e, se quiser, anexe o seu modelo de contrato.", target: "settings-contract-signer", feature: "contracts" },
      { id: "equipe", route: "/admin/settings#equipe", title: "5. Equipe", content: "Convide quem trabalha com você e escolha a função de cada um.", target: "settings-team", permission: "team" },
      { id: "veiculo", route: "/admin/vehicles", title: "6. Primeiro veículo", content: "Por fim, cadastre a frota em Novo veículo. Depois disso você já pode cadastrar clientes e fazer locações.", target: "vehicles-new", quick: true },
    ],
  },
  {
    id: "jornada-cadastrar-frota", title: "Como cadastrar sua frota", kind: "jornada", module: "veiculos", route: "/admin/vehicles",
    permission: "operate", minutes: 3, version: 1, article: "cadastrar-veiculo",
    description: "Do documento do carro à FIPE e ao rastreamento.",
    keywords: ["frota", "cadastrar", "carro", "veiculo", "fipe", "documento"], aliases: ["cadastrar varios carros", "montar minha frota"],
    learn: ["importar dados do CRLV-e", "consultar a FIPE", "anexar fotos e documento", "ligar o rastreador ao carro"],
    next: "jornada-primeira-locacao",
    steps: [
      { id: "new", title: "Comece por Novo veículo", content: "Cada carro ou moto é cadastrado uma vez e fica disponível para reservas, locações, manutenções e multas.", target: "vehicles-new", quick: true },
      { id: "crlv", title: "Use o documento digital", content: "Com o CRLV-e em PDF ou foto, o sistema tenta preencher placa, marca, modelo, ano, Renavam e chassi. Confira antes de salvar.", target: "vehicles-form-crlv", click: "vehicles-new", dialog: true, quick: true },
      { id: "fipe", title: "Valor de referência", content: "Busque a versão na Tabela FIPE para acompanhar quanto cada carro vale.", target: "vehicles-form-fipe", click: "vehicles-new", dialog: true, feature: "fipe" },
      { id: "photos", title: "Fotos e documento", content: "Anexe fotos e o documento (CRLV). Feche com Cancelar: o tour não salva nada.", target: "vehicles-form-photos", click: "vehicles-new", dialog: true },
      { id: "tracking", route: "/admin/monitoring", title: "Rastreamento (se usar)", content: "Com rastreador Selsyn, sincronize aqui e, na aba Vínculos, ligue cada rastreador ao carro cadastrado.", target: "monitoring-tabs", feature: "tracking" },
    ],
  },
  {
    id: "jornada-primeira-locacao", title: "Como fazer sua primeira locação", kind: "jornada", module: "locacoes", route: "/admin/clients",
    permission: "operate", minutes: 5, version: 1, article: "fluxo-completo-locacao",
    description: "Cliente, veículo, locação, contrato, entrega, cobrança e devolução.",
    keywords: ["primeira locacao", "alugar", "fluxo", "passo a passo", "locacao", "contrato"], aliases: ["como alugar meu primeiro carro", "fazer uma locacao do zero", "passo a passo da locacao"],
    learn: ["a ordem certa: cliente, carro, locação", "onde gerar e enviar o contrato", "como a vistoria muda o status", "onde cobrar e dar baixa"],
    next: "jornada-receber-pagamento",
    steps: [
      { id: "intro", title: "O caminho de uma locação", content: "Cliente cadastrado, carro cadastrado, locação criada com as parcelas, contrato assinado, entrega com vistoria, cobranças, e por fim a devolução. Vamos passar por cada tela.", quick: true },
      { id: "client", route: "/admin/clients", title: "1. Cadastre o cliente", content: "Em Novo cliente informe documento, nome, telefone (WhatsApp) e CNH.", target: "clients-new", quick: true },
      { id: "vehicle", route: "/admin/vehicles", title: "2. Tenha o carro cadastrado", content: "O carro precisa existir em Veículos e estar Disponível.", target: "vehicles-search" },
      { id: "reservation", route: "/admin/reservations", title: "Opcional: reserva", content: "Se o cliente vai retirar em outro dia, faça uma reserva para segurar o carro. Ela não vira locação sozinha: no dia, crie a locação.", target: "reservations-new", feature: "reservations" },
      { id: "rental", route: "/admin/rentals", title: "3. Crie a locação", content: "Em Nova locação escolha cliente, carro, datas, valor e periodicidade das parcelas. O sistema gera as cobranças.", target: "rentals-new", quick: true },
      { id: "contract", route: "/admin/rentals/[id]", via: "/admin/rentals", click: "rentals-view", title: "4. Gere e envie o contrato", content: "Dentro da locação, gere o contrato e envie ao cliente por e-mail e WhatsApp, ou assine presencialmente.", target: "rental-detail-contract", optional: true, feature: "contracts", quick: true },
      { id: "delivery", title: "5. Entrega com vistoria", content: "Registre a entrega com quilometragem, combustível, checklist e assinatura: a locação fica Ativa e o carro Alugado.", target: "rental-detail-inspections", optional: true, quick: true },
      { id: "charge", route: "/admin/pagamentos", title: "6. Cobre e dê baixa", content: "As parcelas aparecem em Pagamentos para cobrar e registrar o recebimento.", target: "payments-filters", permission: "finance", quick: true },
      { id: "return", title: "7. Devolução", content: "No fim, volte à locação e registre a devolução: ela fica Finalizada e o carro volta a Disponível. Confira antes se ficou alguma parcela em aberto." },
    ],
  },
  {
    id: "jornada-receber-pagamento", title: "Como receber de um locatário", kind: "jornada", module: "pagamentos", route: "/admin/pagamentos",
    permission: "finance", feature: "payments", minutes: 3, version: 1, article: "dar-baixa-pagamento",
    description: "Cobrança, forma de pagamento, conferência e reflexo no financeiro.",
    keywords: ["receber", "cobrar", "pagamento", "baixa", "comprovante", "pix"], aliases: ["cliente pagou", "como dar baixa", "aprovar comprovante"],
    learn: ["encontrar a parcela", "cobrar pelo meio ativo", "conferir comprovantes", "dar baixa e ver no financeiro"],
    steps: [
      { id: "find", title: "1. Encontre a parcela", content: "Filtre por Vencendo hoje ou Vencidos, ou busque pelo nome do cliente.", target: "payments-filters", quick: true },
      { id: "charge", title: "2. Cobre", content: "No cartão da parcela, Cobrar envia a cobrança pelo meio ativo: PIX por WhatsApp, link InfinitePay ou cobrança Asaas.", target: "payments-card-actions", optional: true, quick: true },
      { id: "receipt", route: "/admin/finance", title: "3. Confira o comprovante", content: "No PIX manual, o comprovante enviado pelo cliente aparece no Financeiro para conferência. Aprovar dá baixa e avisa o cliente.", target: "finance-receipts", optional: true, feature: "finance" },
      { id: "settle", route: "/admin/pagamentos", title: "4. Baixa manual", content: "Recebeu em dinheiro, transferência ou outro meio? Use Dar baixa e informe valor, data e forma de pagamento. No Asaas e no link InfinitePay a baixa é automática.", target: "payments-card-actions", optional: true },
      { id: "finance", route: "/admin/finance", title: "5. Veja no Financeiro", content: "Os recebimentos entram nas receitas e no saldo do mês.", target: "finance-kpis", feature: "finance", quick: true },
    ],
  },
  {
    id: "jornada-devolucao", title: "Como receber um veículo de volta", kind: "jornada", module: "vistorias", route: "/admin/rentals",
    permission: "operate", minutes: 2, version: 1, article: "vistoria-entrega-devolucao",
    description: "Vistoria de devolução, quilometragem, ocorrências e pendências antes de finalizar.",
    keywords: ["devolucao", "devolver", "vistoria", "finalizar", "quilometragem"], aliases: ["cliente devolveu o carro", "encerrar locacao", "finalizar aluguel"],
    learn: ["onde registrar a devolução", "o que conferir antes de finalizar"],
    steps: [
      { id: "open", title: "Abra a locação", content: "Encontre a locação pelo nome do cliente ou pela placa e clique para abrir.", target: "rentals-search", quick: true },
      { id: "pending", route: "/admin/rentals/[id]", via: "/admin/rentals", click: "rentals-view", title: "Confira as parcelas", content: "Veja se há parcela Atrasada ou A receber antes de encerrar.", target: "rental-detail-installments", optional: true, quick: true },
      { id: "inspection", title: "Registre a devolução", content: "Em Vistorias, Registrar devolução pede quilometragem, combustível, checklist de avarias, valores adicionais e assinatura. Ao salvar, a locação fica Finalizada e o carro Disponível.", target: "rental-detail-inspections", optional: true, quick: true },
      { id: "app", route: "/admin/incidents", title: "Ocorrências do cliente", content: "Se o cliente relatou algum problema pelo aplicativo durante a locação, ele aparece em App do locatário.", target: "incidents-tabs", feature: "tenant_app" },
    ],
  },
];
