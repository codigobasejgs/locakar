// Testes da Central de Ajuda: busca, sinônimos, perfis, rotas e progresso. `npm run help:validate`.
import assert from "node:assert/strict";
import { articles } from "../src/help";
import { canReadArticle, contextualArticles, routeMatches } from "../src/help/access";
import { emptyProgress, progressKey, readProgress, saveProgress } from "../src/help/progress";
import { searchArticles, tokens } from "../src/help/search";
import type { HelpAccess } from "../src/help/types";

const owner: HelpAccess = { audience: "admin", role: "owner", platformAdmin: false };
const top = (q: string, access = owner) => searchArticles(articles.filter((a) => canReadArticle(a, access)), q)[0]?.article.slug;

// Busca em linguagem natural, sem acento, com erro de digitação e sinônimos
for (const q of ["como cadastrar veículo", "cadastrar carro", "como adicionar veiculo", "colocar carro no sistema", "cadastra veiculo", "como cadastrar meu primeiro carro?"]) {
  assert.equal(top(q), "cadastrar-veiculo", `"${q}" deve achar o cadastro de veículo`);
}
assert.equal(top("cliente mandou comprovante pix onde aprovo"), "aprovar-comprovante-pix");
assert.equal(top("aprovar comprovante"), "aprovar-comprovante-pix");
assert.equal(top("mudar logo"), "configurar-identidade-visual");
assert.equal(top("convidar funcionario"), "gerenciar-equipe-permissoes");
assert.equal(top("multa"), "gerenciar-multas-transito");
assert.equal(top("configurar asaas"), "integracao-asaas-cobrancas");
assert.ok(searchArticles(articles, "pagamento").length >= 3, "pagamento traz vários artigos");
assert.deepEqual(searchArticles(articles, "xyzzy foguete marciano"), [], "sem resultado não inventa");
assert.deepEqual(tokens("Veículos"), ["veiculo"]);

// Perfis: viewer não vê operação; locatário só vê guia dele; Super Admin só com flag
const viewer: HelpAccess = { audience: "admin", role: "viewer", platformAdmin: false };
const tenant: HelpAccess = { audience: "tenant", role: null, platformAdmin: false };
const loading: HelpAccess = { audience: "admin", role: null, platformAdmin: false };
const art = (slug: string) => articles.find((a) => a.slug === slug)!;
assert.equal(canReadArticle(art("cadastrar-veiculo"), viewer), false);
assert.equal(canReadArticle(art("relatorios-exportacao-csv"), viewer), true);
assert.equal(canReadArticle(art("cadastrar-veiculo"), tenant), false);
assert.equal(canReadArticle(art("app-locatario-pagar-pix-cartao"), tenant), true);
assert.equal(canReadArticle(art("app-locatario-pagar-pix-cartao"), owner), false);
assert.equal(canReadArticle(art("super-admin-gestao-plataforma"), owner), false);
assert.equal(canReadArticle(art("super-admin-gestao-plataforma"), { ...owner, platformAdmin: true }), true);
assert.equal(articles.filter((a) => canReadArticle(a, loading)).length, 0, "sem perfil carregado não mostra nada restrito");

// Ajuda contextual por rota (inclui rota dinâmica e aba por hash)
assert.ok(routeMatches("/admin/rentals/[id]", "/admin/rentals/abc"));
assert.ok(!routeMatches("/admin/rentals/[id]", "/admin/rentals"));
assert.ok(routeMatches("/admin/settings#contratos", "/admin/settings#contratos"));
assert.ok(!routeMatches("/admin/settings#contratos", "/admin/settings#empresa"));
assert.ok(contextualArticles(articles, "/admin/vehicles", owner).some((a) => a.slug === "cadastrar-veiculo"));

// Progresso: armazenamento vazio, quebrado, bloqueado e separado por conta/locadora
const mem = new Map<string, string>();
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
assert.deepEqual(readProgress(store, "x"), emptyProgress());
mem.set("bad", "{nao json");
assert.deepEqual(readProgress(store, "bad"), emptyProgress());
assert.deepEqual(readProgress(null, "x"), emptyProgress());
const blocked = { setItem: () => { throw new Error("quota"); } };
assert.equal(saveProgress(blocked, "x", emptyProgress()), false);
saveProgress(store, progressKey("u1", "orgA"), { ...emptyProgress(), completed: ["cadastrar-veiculo"] });
assert.deepEqual(readProgress(store, progressKey("u1", "orgA")).completed, ["cadastrar-veiculo"]);
assert.deepEqual(readProgress(store, progressKey("u1", "orgB")).completed, [], "outra locadora não herda progresso");

console.log(`OK ajuda: ${articles.length} artigos, busca, sinônimos, perfis, rotas e progresso`);
