import operation from "./content/operacao.json";
import settings from "./content/configuracoes.json";
import payments from "./content/pagamentos.json";
import tenant from "./content/locatario.json";
import tenantExtra from "./content/locatario-extra.json";
import account from "./content/conta.json";
import basics from "./content/primeiros-passos.json";
import troubleshooting from "./content/problemas.json";
import type { HelpArticle } from "./types";

export const articles = [...basics, ...operation, ...settings, ...payments, ...tenant, ...tenantExtra, ...account, ...troubleshooting] as HelpArticle[];
const names: Record<string, string> = {
  "primeiros-passos": "Primeiros passos", dashboard: "Dashboard", veiculos: "Veículos", clientes: "Clientes",
  reservas: "Reservas", locacoes: "Locações", contratos: "Contratos", pagamentos: "Pagamentos", financeiro: "Financeiro",
  despesas: "Despesas", manutencao: "Manutenção", multas: "Multas", anotacoes: "Anotações", relatorios: "Relatórios",
  configuracoes: "Configurações", empresa: "Empresa", aparencia: "Aparência e marca", equipe: "Equipe e permissões",
  integracoes: "Integrações", notificacoes: "Notificações", seguranca: "Segurança", solicitacoes: "Solicitações",
  rastreamento: "Rastreamento", vistorias: "Vistorias", ocorrencias: "Ocorrências e documentos", locatario: "Guia do locatário",
  plataforma: "Super Admin", problemas: "Solução de problemas", conta: "Conta e acesso", textos: "Textos e mensagens",
};
export const categoryName = (slug: string) => names[slug] ?? slug;
export const categoriesOf = (list: HelpArticle[]) => [...new Set(list.map((a) => a.category))].map((slug) => ({ slug, title: categoryName(slug), count: list.filter((a) => a.category === slug).length }));
export function relatedArticles(article: HelpArticle, list: HelpArticle[]) {
  const explicit = article.related.map((s) => list.find((a) => a.slug === s)).filter((a): a is HelpArticle => Boolean(a));
  return [...explicit, ...list.filter((a) => a.slug !== article.slug && a.category === article.category && !article.related.includes(a.slug))].slice(0, 4);
}
// Cada categoria gera sua trilha. A implantação é ordenada pelo conteúdo específico de primeiros passos.
export const trainingsOf = (list: HelpArticle[]) => categoriesOf(list).map((c) => ({ ...c, lessons: list.filter((a) => a.category === c.slug), description: `Aprenda ${c.title.toLowerCase()} seguindo os tutoriais em sequência.` }));
export const helpVersion = { docsVersion: "1.1", appVersion: "0.1.0", lastReviewedAt: "2026-10-03" };
