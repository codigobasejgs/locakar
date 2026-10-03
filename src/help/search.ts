import type { HelpArticle } from "./types";

const stop = new Set("a o as os de da do das dos e em no na nos nas um uma como meu minha primeiro primeira para por eu onde esta este sistema conseguir preciso posso qual que".split(" "));
const synonyms: Record<string, string> = {
  carros: "veiculo", carro: "veiculo", automovel: "veiculo", automoveis: "veiculo", veiculos: "veiculo",
  clientes: "cliente", locatarios: "cliente", locatario: "cliente", motorista: "cliente", motoristas: "cliente",
  aluguel: "locacao", alugueis: "locacao", alugar: "locacao", locacoes: "locacao", reservas: "reserva",
  cadastrar: "cadastro", cadastra: "cadastro", cadastrando: "cadastro", adicionar: "cadastro", registrar: "cadastro", novo: "cadastro", nova: "cadastro", colocar: "cadastro",
  pagamentos: "pagamento", pagar: "pagamento", parcelas: "parcela", cobrancas: "cobranca", cobrar: "cobranca",
  logotipo: "logo", logos: "logo", mudar: "alterar", trocar: "alterar", editar: "alterar", atualizar: "alterar",
  notificacoes: "notificacao", multas: "multa", manutencoes: "manutencao", contratos: "contrato", comprovantes: "comprovante",
  moto: "veiculo", motos: "veiculo", inquilino: "cliente",
  receber: "pagamento", recebimento: "pagamento", recebimentos: "pagamento", boleto: "cobranca", qrcode: "pix",
  apagar: "excluir", remover: "excluir", deletar: "excluir", funcionario: "equipe", funcionarios: "equipe", usuario: "equipe", usuarios: "equipe",
  vistorias: "vistoria", despesas: "despesa", gastos: "despesa", gasto: "despesa", relatorios: "relatorio", assinar: "assinatura",
  marca: "logo", cores: "cor", erro: "problema", erros: "problema", bloqueado: "problema",
};
export function normalize(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function tokens(text: string) {
  return [...new Set(normalize(text).split(/\s+/).filter((s) => s && !stop.has(s)).map((s) => synonyms[s] ?? s))];
}
// Uma inserção/remoção/troca: suficiente para erros curtos sem comparar qualquer palavra com qualquer outra.
function near(a: string, b: string) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; let j = 0; let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
export function searchArticles(articles: HelpArticle[], query: string) {
  const wanted = tokens(query);
  if (!wanted.length) return [];
  return articles.map((article) => {
    const fields: [string[], number][] = [
      [tokens(article.title + " " + article.aliases.join(" ")), 12],
      [tokens(article.keywords.join(" ") + " " + article.category), 8],
      [tokens(article.description + " " + article.faq.map((q) => q.question).join(" ")), 5],
      [tokens(article.steps.map((s) => s.title + " " + s.text + " " + (s.fields ?? []).map((f) => f.name + " " + f.description).join(" ")).join(" ") + " " + article.problems.map((p) => p.question + " " + p.answer).join(" ")), 1],
    ];
    let matched = 0; let score = 0;
    for (const term of wanted) {
      let best = 0;
      for (const [words, weight] of fields) {
        if (words.includes(term)) best = Math.max(best, weight);
        else if (words.some((w) => near(term, w))) best = Math.max(best, weight * 0.65);
        else if (term.length >= 4 && words.some((w) => w.startsWith(term))) best = Math.max(best, weight * 0.5);
      }
      if (best) { matched++; score += best; }
    }
    score *= matched / wanted.length;
    if (normalize(article.title).includes(normalize(query))) score += 15;
    return { article, score, matched };
  }).filter((r) => r.matched > 0 && r.score >= 3).sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, "pt-BR"));
}
