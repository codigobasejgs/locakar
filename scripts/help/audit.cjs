/* eslint-disable @typescript-eslint/no-require-imports -- inventário executável com Node */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    ['node_modules', '.next', 'dist'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const rel = (f) => path.relative(root, f).replaceAll('\\', '/');
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const toRoute = (file, base) => '/' + file.replace(base, '').replace(/\/(page|route)\.tsx?$/, '').replace(/\.tsx?$/, '').replace(/(^|\/)index$/, '').split('/').filter((s) => s && !/^\(.*\)$/.test(s)).join('/');
const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'apps/locatario/app'))].filter((f) => /\.(ts|tsx)$/.test(f));
const sources = files.map((f) => {
  const source = fs.readFileSync(f, 'utf8');
  const file = rel(f);
  let kind = 'component'; let route = null;
  if (/src\/app\/.*\/page\.tsx$/.test(file) || file === 'src/app/page.tsx') {
    kind = 'page'; route = toRoute(file, 'src/app');
  } else if (/src\/app\/.*\/route\.ts$/.test(file)) {
    kind = 'api'; route = toRoute(file, 'src/app');
  } else if (file.startsWith('apps/locatario/app/') && !file.endsWith('_layout.tsx')) {
    kind = 'tenant-page'; route = ('/locatario' + toRoute(file, 'apps/locatario/app')).replace(/\/$/, '');
  }
  // Evidência textual, não interpretação: labels calculados/campos condicionais exigem leitura humana.
  const labels = [...source.matchAll(/\b(?:label|placeholder|title|description)="([^"]+)"/g)].map((m) => m[1]);
  const messages = [...source.matchAll(/toast\.(?:error|success|message)\("([^"]+)"/g)].map((m) => m[1]);
  return { file, kind, route, hash: hash(source), labels: [...new Set(labels)], messages: [...new Set(messages)] };
});
const articles = walk(path.join(root, 'src/help/content')).filter((f) => f.endsWith('.json')).flatMap((f) => {
  const value = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(value) ? value : [];
}).filter((a) => a.slug && a.routes);
const pages = sources.filter((s) => ['page', 'tenant-page'].includes(s.kind) && !/\/ajuda(?:\/|$)/.test(s.route));
// Tours: rotas lidas do registro (texto), sem executar código do app.
const tourText = walk(path.join(root, 'src/help/content/tours')).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
// Telas de módulo têm tour próprio; a rota do passo com [param] também conta (ex.: detalhes da locação).
const tourRoutes = [
  ...tourText.matchAll(/kind: "(?:modulo|configuracao|geral)"[^\n]*?route: "([^"#]+)/g),
  ...tourText.matchAll(/\bid: "settings-[a-z]+"[^\n]*?route: "([^"#]+)/g),
  ...tourText.matchAll(/\broute: "(\/admin[^"#]*\[[^"]+)"/g),
].map((m) => m[1]);
const coverage = pages.map((s) => ({ file: s.file, route: s.route, articles: articles.filter((a) => a.routes.includes(s.route)).map((a) => a.slug), tour: tourRoutes.includes(s.route) }));
const oldPath = path.join(root, 'docs/help-source-review.json');
const old = fs.existsSync(oldPath) ? JSON.parse(fs.readFileSync(oldPath, 'utf8')) : {};
const needsReview = articles.flatMap((a) => (a.sources || []).filter((f) => old[f] && sources.find((s) => s.file === f)?.hash !== old[f]).map((f) => ({ article: a.slug, source: f, status: 'NEEDS_REVIEW' })));
const report = { appVersion: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version, generatedAt: new Date().toISOString(), note: 'Inventário estrutural. Campos calculados, permissões e efeitos precisam de auditoria humana. Cobertura por rota não comprova cobertura de cada ação.', pages: coverage, apiRoutes: sources.filter((s) => s.kind === 'api').map(({ file, route }) => ({ file, route })), sources, needsReview };
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/help-inventory.json'), JSON.stringify(report, null, 2) + '\n');
if (process.argv.includes('--reviewed')) {
  fs.writeFileSync(oldPath, JSON.stringify(Object.fromEntries(sources.map((s) => [s.file, s.hash])), null, 2) + '\n');
}
console.log(`Inventário: ${pages.length} telas; ${report.apiRoutes.length} rotas técnicas; ${articles.length} artigos; ${coverage.filter((s) => s.articles.length).length} telas relacionadas; ${coverage.filter((s) => s.tour).length} telas com tour; ${needsReview.length} fontes pedem revisão.`);
console.log('Arquivo: docs/help-inventory.json. Sem acesso ao banco ou a serviços externos.');
