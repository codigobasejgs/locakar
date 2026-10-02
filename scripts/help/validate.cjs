/* eslint-disable @typescript-eslint/no-require-imports -- validação com Node */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../..');
const contentDir = path.join(root, 'src/help/content');
const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.json'));

let totalArticles = 0;
const slugs = new Set();
const categories = new Set();
const allRelated = [];

for (const file of files) {
  const content = JSON.parse(fs.readFileSync(path.join(contentDir, file), 'utf8'));
  assert.ok(Array.isArray(content), `${file} deve ser um array de artigos`);
  for (const a of content) {
    totalArticles++;
    assert.ok(a.slug && typeof a.slug === 'string', `Artigo sem slug em ${file}`);
    assert.ok(!slugs.has(a.slug), `Slug duplicado: ${a.slug}`);
    slugs.add(a.slug);

    assert.ok(a.title && a.title.length >= 5, `Título muito curto: ${a.slug}`);
    assert.ok(a.description && a.description.length >= 10, `Descrição muito curta: ${a.slug}`);
    assert.ok(a.category, `Categoria ausente: ${a.slug}`);
    categories.add(a.category);

    assert.ok(['admin', 'tenant', 'platform'].includes(a.audience), `Público inválido: ${a.audience} em ${a.slug}`);
    assert.ok(['read', 'operate', 'finance', 'settings', 'team', 'integrations'].includes(a.permission), `Permissão inválida: ${a.permission} em ${a.slug}`);
    assert.ok(Array.isArray(a.keywords) && a.keywords.length >= 3, `Menos de 3 keywords: ${a.slug}`);
    assert.ok(Array.isArray(a.aliases) && a.aliases.length >= 1, `Sem aliases: ${a.slug}`);
    assert.ok(Array.isArray(a.routes) && a.routes.length >= 1, `Sem rotas: ${a.slug}`);
    assert.ok(Array.isArray(a.steps) && a.steps.length >= 2, `Menos de 2 passos: ${a.slug}`);
    assert.ok(typeof a.minutes === 'number' && a.minutes >= 1, `Minutos inválidos: ${a.slug}`);

    // Valida estrutura de passos
    for (const s of a.steps) {
      assert.ok(s.title, `Passo sem título em ${a.slug}`);
      assert.ok(s.text, `Passo sem texto em ${a.slug}`);
    }

    // Guarda para validar se links relacionados existem
    if (Array.isArray(a.related)) {
      for (const rel of a.related) allRelated.push({ from: a.slug, to: rel });
    }
  }
}

// Valida links relacionados
let brokenRelated = 0;
for (const rel of allRelated) {
  if (!slugs.has(rel.to)) {
    console.warn(`[AVISO] Artigo relacionado não encontrado: "${rel.to}" apontado por "${rel.from}"`);
    brokenRelated++;
  }
}

console.log(`[VALIDAÇÃO OK] Total de artigos: ${totalArticles}`);
console.log(`[VALIDAÇÃO OK] Categorias mapeadas: ${categories.size}`);
console.log(`[VALIDAÇÃO OK] Slugs únicos validados: ${slugs.size}`);
if (brokenRelated > 0) {
  console.log(`[INFO] ${brokenRelated} links relacionados apontam para artigos em elaboração.`);
}
