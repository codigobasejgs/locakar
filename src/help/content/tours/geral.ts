import type { TourDef } from "../../types";

/** Tour geral: um passeio pelo menu. Cada parada aponta o item real do menu lateral e diz para que a área serve. */
const nav = (slug: string, title: string, content: string, extra: Partial<TourDef["steps"][number]> = {}) => ({
  id: `nav-${slug}`,
  title,
  content,
  target: `nav-${slug}`,
  placement: "right" as const,
  ...extra,
});

export const geral: TourDef[] = [
  {
    id: "conheca-seu-sistema",
    title: "Conheça seu sistema",
    description: "Passeio rápido por todas as áreas do painel: para que cada uma serve e quando usar.",
    kind: "geral",
    module: "primeiros-passos",
    route: "/admin",
    permission: "read",
    minutes: 4,
    version: 1,
    article: "primeiros-passos-visao-geral",
    keywords: ["tour", "conhecer", "sistema", "inicio", "comecar", "passeio", "apresentacao"],
    aliases: ["conhecer o sistema", "primeiro acesso", "como funciona o sistema", "visao geral do painel"],
    learn: [
      "onde fica cada área do sistema",
      "para que serve cada parte do menu",
      "onde pedir ajuda quando tiver dúvida",
    ],
    next: "jornada-prepare-sua-locadora",
    steps: [
      {
        id: "bem-vindo",
        title: "Bem-vindo!",
        content:
          "Vamos fazer um passeio rápido pelas principais áreas da {org}. Você pode interromper a qualquer momento e continuar de onde parou. Nada será alterado: o tour só mostra e explica.",
        quick: true,
      },
      nav("admin", "Dashboard", "O Dashboard é o seu ponto de partida. Aqui você acompanha um resumo da operação e identifica rapidamente o que precisa da sua atenção: carros disponíveis, locações ativas, valores em atraso e alertas.", { quick: true }),
      nav("requests", "Solicitações", "Pedidos de locação que os clientes fazem pelo aplicativo chegam aqui, com documentos anexados. Você confere, aprova (o sistema cria a locação e o contrato), recusa ou pede um ajuste.", { permission: "operate" }),
      nav("rentals", "Locações", "Cada carro alugado é uma locação: quem alugou, qual veículo, período, valor das parcelas e quilometragem. É aqui que você abre a locação, gera o contrato e registra entrega e devolução.", { quick: true }),
      nav("reservations", "Reservas", "Agenda de reservas: separa um carro para um cliente em datas futuras. O sistema avisa se o carro já estiver reservado ou alugado no mesmo período.", { feature: "reservations" }),
      nav("vehicles", "Veículos", "Sua frota: cadastro de cada carro ou moto com placa, documentos, fotos, quilometragem e valor de compra. É a base de todo o resto.", { quick: true }),
      nav("monitoring", "Rastreamento", "Se a sua locadora usa rastreador Selsyn, aqui você vê a posição dos veículos no mapa, histórico e sensores. Só consulta: nenhum comando é enviado ao carro.", { feature: "tracking" }),
      nav("clients", "Clientes", "Cadastro dos locatários: documento, CNH, contatos e endereço, com o histórico de locações de cada um.", { quick: true }),
      nav("pagamentos", "Pagamentos", "Todas as parcelas das locações em um só lugar: o que está em aberto, vencido ou pago. Daqui você cobra o cliente e dá baixa quando o dinheiro entra.", { quick: true, permission: "finance" }),
      nav("finance", "Financeiro", "Resumo do dinheiro: receitas, despesas e saldo por mês, além do que está pendente de receber e de pagar.", { permission: "finance", feature: "finance" }),
      nav("expenses", "Despesas", "Gastos da operação, como seguro, IPVA, oficina e combustível. Eles entram no saldo do Financeiro e no lucro por veículo.", { permission: "finance", feature: "finance" }),
      nav("maintenance", "Manutenção", "Histórico e agenda de manutenções de cada carro: troca de óleo, revisões, pneus. Ajuda a não perder prazos e a saber quanto cada veículo custa.", { feature: "maintenance" }),
      nav("fines", "Multas", "Multas de trânsito da frota: prazo para indicar o condutor, vencimento, desconto e pagamento.", { feature: "fines" }),
      nav("notes", "Anotações", "Um diário da operação: combinados com clientes, ocorrências e lembretes, organizados por data."),
      nav("incidents", "App do locatário", "O que seus clientes enviam pelo aplicativo: problemas com o carro (ocorrências) e documentos como CNH e comprovante de endereço para você conferir.", { feature: "tenant_app" }),
      nav("security", "Segurança", "Sinais de uso do aplicativo pelos clientes, como aparelhos e acessos, para ajudar na conferência. É uma orientação, não uma acusação: nenhum cliente é bloqueado automaticamente.", { permission: "settings", feature: "tenant_app" }),
      nav("reports", "Relatórios", "Relatórios por período, veículo e status de frota, locações, receitas, despesas, manutenção, multas e reservas, com impressão e exportação para planilha.", { feature: "reports" }),
      nav("settings", "Configurações", "Dados da empresa, logo e cores, equipe, contratos, formas de pagamento e integrações. Vale configurar logo no começo.", { quick: true, permission: "settings" }),
      {
        id: "ajuda",
        title: "Sempre que precisar, clique em Ajuda",
        content:
          "No topo de cada tela há o botão Ajuda: ele mostra o tour daquela tela, os guias passo a passo e as dúvidas comuns. A Central de Ajuda e Treinamento fica no fim do menu.",
        target: "nav-ajuda",
        placement: "right",
        quick: true,
      },
    ],
  },
];
