import {
  CONTRACT_STATUS,
  FINE_STATUS,
  MAINTENANCE_STATUS,
  PAYMENT_STATE,
  RENTAL_STATUS,
  RESERVATION_STATUS,
  VEHICLE_STATUS,
} from "@/lib/constants";

export interface GlossaryTerm {
  term: string;
  definition: string;
  audience: "admin" | "tenant" | "all";
  /** Artigo que explica o termo na prática. */
  article?: string;
}
export interface StatusGroup {
  title: string;
  article?: string;
  items: { label: string; meaning: string }[];
}

export const glossary: GlossaryTerm[] = [
  { term: "Locatário", definition: "Pessoa que aluga o veículo. No painel aparece em Clientes; no aplicativo é quem entra para pagar, enviar documentos e fazer vistoria.", audience: "all", article: "cadastrar-cliente" },
  { term: "Locação", definition: "Contrato de uso de um veículo por um cliente durante um período, com valor, forma de cobrança e parcelas.", audience: "all", article: "criar-locacao-contrato" },
  { term: "Reserva", definition: "Pedido para usar um veículo em datas futuras. Pode ser confirmada e depois convertida em locação.", audience: "all", article: "criar-reserva" },
  { term: "Solicitação de locação", definition: "Pedido feito pelo locatário no aplicativo. A equipe aprova ou recusa em Solicitações.", audience: "admin", article: "aprovar-solicitacao-locacao" },
  { term: "Caução", definition: "Valor de garantia combinado na locação, registrado no campo de caução.", audience: "all", article: "criar-locacao-contrato" },
  { term: "Parcela", definition: "Cada cobrança periódica gerada pela locação (semanal, quinzenal, mensal ou diária). Tem vencimento, valor e situação.", audience: "all", article: "visao-geral-pagamentos" },
  { term: "Cobrança", definition: "Pedido de pagamento de uma parcela enviado ao cliente (PIX, link, WhatsApp ou boleto/PIX do Asaas).", audience: "all", article: "cobrar-whatsapp-pix" },
  { term: "Dar baixa", definition: "Registrar no sistema que uma parcela foi paga, informando data e valor recebidos.", audience: "admin", article: "dar-baixa-pagamento" },
  { term: "Comprovante", definition: "Imagem do pagamento enviada pelo locatário no aplicativo. A equipe confere e aprova ou recusa.", audience: "all", article: "aprovar-comprovante-pix" },
  { term: "PIX manual", definition: "PIX pago direto na chave da locadora. Não há confirmação automática: a equipe confere o comprovante.", audience: "all", article: "aprovar-comprovante-pix" },
  { term: "Asaas", definition: "Integração opcional de cobranças (PIX e boleto) com baixa automática quando o Asaas confirma o pagamento.", audience: "admin", article: "integracao-asaas-cobrancas" },
  { term: "InfinitePay", definition: "Integração opcional para receber por link de pagamento ou cartão por aproximação.", audience: "admin", article: "integracao-infinitepay" },
  { term: "Hodômetro", definition: "Quilometragem registrada do veículo. Informada no cadastro, na entrega e na devolução.", audience: "all", article: "cadastrar-veiculo" },
  { term: "RENAVAM", definition: "Número de registro do veículo no Detran, presente no documento (CRLV).", audience: "admin", article: "cadastrar-veiculo" },
  { term: "Chassi", definition: "Identificação única gravada na estrutura do veículo, presente no CRLV.", audience: "admin", article: "cadastrar-veiculo" },
  { term: "CRLV", definition: "Documento de licenciamento do veículo. Pode ser anexado ao cadastro.", audience: "admin", article: "cadastrar-veiculo" },
  { term: "Tabela FIPE", definition: "Referência de preço médio de veículos. O valor FIPE não é o valor de compra do seu veículo.", audience: "admin", article: "configurar-tabela-fipe" },
  { term: "Vistoria", definition: "Registro do estado do veículo com fotos na entrega e na devolução.", audience: "all", article: "vistoria-entrega-devolucao" },
  { term: "Ocorrência", definition: "Problema relatado pelo locatário (pane, batida, manutenção) para a equipe acompanhar.", audience: "all", article: "conferir-ocorrencias-documentos" },
  { term: "Multa", definition: "Infração de trânsito registrada para um veículo e, quando identificado, para o condutor.", audience: "all", article: "gerenciar-multas-transito" },
  { term: "Modelo de contrato", definition: "Arquivo (DOCX/PDF) da locadora com os campos variáveis mapeados. A IA ajuda só na configuração do modelo.", audience: "admin", article: "modelos-contrato-ia" },
  { term: "Assinatura eletrônica", definition: "O cliente abre o link do contrato e assina pelo celular.", audience: "all", article: "gerar-assinar-contrato" },
  { term: "Rastreamento", definition: "Posição dos veículos vinculados ao rastreador Selsyn, exibida em Monitoramento.", audience: "admin", article: "monitoramento-frota-selsyn" },
  { term: "Perfil de acesso", definition: "Papel do membro da equipe (Proprietário, Administrador, Gerente, Financeiro, Operador, Somente leitura). Define o que cada um pode fazer.", audience: "admin", article: "gerenciar-equipe-permissoes" },
  { term: "Notificação push", definition: "Aviso que aparece no celular ou computador mesmo com o sistema fechado.", audience: "all", article: "notificacoes-web-push-alertas" },
];

const meanings: Record<string, string> = {
  "Disponível": "Pode ser reservado ou alugado.",
  "Alugado": "Está em uma locação ativa.",
  "Reservado": "Separado para uma reserva.",
  "Manutenção": "Fora de operação por manutenção.",
  "Vendido": "Não faz mais parte da frota operante.",
  "Ativa": "Em andamento, gerando parcelas.",
  "Finalizada": "Encerrada, veículo devolvido.",
  "Atrasada": "Passou da data prevista ou possui atraso.",
  "Cancelada": "Cancelada, não gera mais cobranças.",
  "Pendente": "Aguardando uma ação para seguir.",
  "Confirmada": "Aceita pela locadora.",
  "Concluída": "Já atendida.",
  "Identificar condutor": "É preciso indicar quem dirigia.",
  "Pago": "Quitado.",
  "Vencida": "Passou do vencimento sem pagamento.",
  "Contestada": "Em recurso.",
  "Agendada": "Marcada para uma data futura.",
  "Realizada": "Serviço feito.",
  "Aguardando assinatura": "Gerado e enviado, falta o cliente assinar.",
  "Assinado": "Assinado pelo cliente.",
  "Cancelado": "Sem validade.",
  "Em aberto": "Ainda não venceu e não foi pago.",
  "Atrasado": "Venceu e não foi pago.",
};
const group = (title: string, map: Record<string, { label: string }>, article?: string): StatusGroup => ({
  title,
  article,
  items: Object.values(map).map(({ label }) => ({ label, meaning: meanings[label] ?? "" })),
});

/** Rótulos vêm das mesmas constantes que as telas usam: renomear na tela renomeia aqui. */
export const statusGroups: StatusGroup[] = [
  group("Veículo", VEHICLE_STATUS, "cadastrar-veiculo"),
  group("Locação", RENTAL_STATUS, "detalhes-locacao-gestao"),
  group("Reserva", RESERVATION_STATUS, "criar-reserva"),
  group("Parcela (tela da locação)", PAYMENT_STATE, "detalhes-locacao-gestao"),
  {
    // Rótulos fixos de src/components/admin/payment-card.tsx (cobranças Asaas mostram o status do Asaas).
    title: "Cobrança (tela de Pagamentos)",
    article: "visao-geral-pagamentos",
    items: [
      { label: "Em aberto", meaning: "Ainda não venceu e não foi paga." },
      { label: "Em análise", meaning: "O locatário enviou comprovante; falta a equipe conferir." },
      { label: "Pago", meaning: "Quitada." },
      { label: "Vencido", meaning: "Venceu sem pagamento." },
      { label: "Cancelado", meaning: "Não será mais cobrada." },
    ],
  },
  group("Contrato", CONTRACT_STATUS, "gerar-assinar-contrato"),
  group("Multa", FINE_STATUS, "gerenciar-multas-transito"),
  group("Manutenção", MAINTENANCE_STATUS, "cadastrar-manutencao"),
  {
    title: "Comprovante PIX",
    article: "aprovar-comprovante-pix",
    items: [
      { label: "Em análise", meaning: "Enviado pelo locatário, aguardando conferência da equipe." },
      { label: "Aprovado", meaning: "Conferido; a parcela é marcada como paga." },
      { label: "Recusado", meaning: "Não confere; o locatário vê o motivo e pode enviar outro." },
    ],
  },
];

export const glossaryFor = (audience: "admin" | "tenant") => glossary.filter((t) => t.audience === "all" || t.audience === audience);
