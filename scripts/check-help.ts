// Testes da Central de Ajuda: busca, sinônimos, perfis, rotas e progresso. `npm run help:validate`.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { articles } from "../src/help";
import { articleContext } from "../src/help/assistant";
import { glossary, glossaryFor, statusGroups } from "../src/help/glossary";
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

// Buscas do usuário comum (prompt de aceite): o artigo certo aparece entre os 3 primeiros.
const top3 = (q: string) => searchArticles(articles.filter((a) => canReadArticle(a, owner)), q).slice(0, 3).map((r) => r.article.slug);
const expected: [string, string][] = [
  ["novo veículo", "cadastrar-veiculo"],
  ["fazer aluguel", "criar-locacao-contrato"],
  ["nova locação", "criar-locacao-contrato"],
  ["cobrar cliente", "cobrar-whatsapp-pix"],
  ["pix", "aprovar-comprovante-pix"],
  ["comprovante", "aprovar-comprovante-pix"],
  ["contrato", "gerar-assinar-contrato"],
  ["manutenção", "cadastrar-manutencao"],
  ["como cadastrar moto", "cadastrar-veiculo"],
  ["por que não consigo excluir cliente", "por-que-nao-consigo"],
  ["registro duplicado", "por-que-nao-consigo"],
  ["apagar veiculo", "editar-excluir-veiculo"],
];
for (const [q, slug] of expected) assert.ok(top3(q).includes(slug), `"${q}" deve trazer ${slug} (veio ${top3(q).join(", ")})`);

// Screenshots: todo arquivo citado existe e está no manifest; marcadores dentro da imagem.
const manifest = JSON.parse(readFileSync(resolve(__dirname, "../public/help/screenshots/manifest.json"), "utf8")) as { file: string }[];
const inManifest = new Set(manifest.map((m) => "/" + m.file.replace(/^public\//, "")));
for (const a of articles) for (const s of a.steps) {
  if (s.image) {
    assert.ok(existsSync(resolve(__dirname, "../public" + s.image)), `${a.slug}: imagem ausente ${s.image}`);
    assert.ok(inManifest.has(s.image), `${a.slug}: ${s.image} fora do manifest (não pode ser recapturada)`);
  }
  for (const m of s.markers ?? []) assert.ok(s.image && m.x >= 0 && m.x <= 100 && m.y >= 0 && m.y <= 100 && m.label, `${a.slug}: marcador inválido`);
  // Nada de credencial em texto de artigo.
  assert.ok(!/sk_live|sk_test|\$aact_|AIza[0-9A-Za-z_-]{20}|eyJhbGci/.test(JSON.stringify(s)), `${a.slug}: possível segredo no texto`);
}

// Glossário só aponta para artigos que existem; locatário não vê termos da equipe.
for (const t of glossary) if (t.article) assert.ok(articles.some((a) => a.slug === t.article), `glossário: ${t.term} → ${t.article} inexistente`);
assert.ok(glossaryFor("tenant").every((t) => t.audience !== "admin"));
for (const g of statusGroups) assert.ok(g.items.length > 0 && g.items.every((i) => i.label), `status ${g.title} vazio`);

// Sem IA: o contexto do assistente é montado só com artigos legíveis, e a busca funciona sozinha.
assert.ok(articleContext(art("aprovar-comprovante-pix")).includes("<doc"), "contexto RAG");
assert.equal(searchArticles(articles, "como faço xyzzy").length, 0);

console.log(`OK ajuda: ${articles.length} artigos, busca, sinônimos, perfis, rotas, progresso, screenshots e glossário`);
