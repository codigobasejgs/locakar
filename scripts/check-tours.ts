// Testes do tour guiado: registro, permissões, plano, progresso, retomada, versão e alvos. `npm run help:validate`.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { articles } from "../src/help";
import { routeMatches } from "../src/help/access";
import { tours, videos } from "../src/help/content/tours";
import {
  completeTour, emptyTourState, mergeTourState, moveTour, pauseTour, readTourState, saveTourState, skipTour, startTour, tourStateKey, tourStatus,
} from "../src/help/tour-progress";
import { brandText, canTakeTour, hasQuickMode, searchTours, stepRoutes, tourSteps, toursForRoute, visibleTours } from "../src/help/tours";
import type { HelpAccess } from "../src/help/types";

const ROOT = path.resolve(__dirname, "..");
const as = (role: HelpAccess["role"], modules?: Record<string, boolean>): HelpAccess => ({ audience: "admin", role, platformAdmin: false, modules });
const owner = as("owner");

/* ---------- Registro ---------- */
const ids = new Set<string>();
for (const t of tours) {
  assert.ok(!ids.has(t.id), `id duplicado: ${t.id}`);
  ids.add(t.id);
  assert.ok(t.steps.length >= 1 && t.version >= 1 && t.minutes >= 1, `${t.id}: passos, versão e minutos`);
  assert.ok(t.learn.length >= 1 && t.keywords.length >= 3, `${t.id}: "agora você sabe" e palavras-chave`);
  if (t.article) assert.ok(articles.some((a) => a.slug === t.article), `${t.id}: artigo ${t.article} não existe`);
  if (t.next) assert.ok(tours.some((x) => x.id === t.next), `${t.id}: próximo ${t.next} não existe`);
  if (t.video) assert.ok(videos[t.video], `${t.id}: vídeo ${t.video} sem URL`);
  const stepIds = new Set<string>();
  for (const s of t.steps) {
    assert.ok(!stepIds.has(s.id), `${t.id}: passo duplicado ${s.id}`);
    stepIds.add(s.id);
    if (s.article) assert.ok(articles.some((a) => a.slug === s.article), `${t.id}/${s.id}: artigo ${s.article} não existe`);
    // Microcopy: explicação curta no balão; o resto vai para "Saiba mais".
    const words = s.content.split(/\s+/).length;
    assert.ok(words <= 95, `${t.id}/${s.id}: ${words} palavras (máx. 95)`);
    // Linguagem do cliente: nada de jargão técnico nos tours operacionais.
    assert.ok(!/\b(endpoint|payload|mutation|query|RLS|repository|webhook|foreign key|API)\b/i.test(s.content + s.title), `${t.id}/${s.id}: jargão técnico`);
    // White label: o tour nunca cita a marca da plataforma.
    assert.ok(!/LOCAKAR/i.test(s.content + s.title), `${t.id}/${s.id}: use {org} em vez da marca`);
    if (s.dialog) assert.ok(s.click, `${t.id}/${s.id}: passo em formulário precisa do controle que o abre`);
  }
}

/* ---------- Ações seguras: o tour só clica em abrir, aba ou detalhes ---------- */
const safeClick = /^([a-z-]+-(new|view)|settings-tab-[a-z]+|incidents-tab-[a-z]+|nav-open-menu)$/;
for (const t of tours) for (const s of t.steps) if (s.click) assert.ok(safeClick.test(s.click), `${t.id}/${s.id}: clique não permitido (${s.click})`);

/* ---------- Rotas reais ---------- */
const appDir = path.join(ROOT, "src/app");
const routeExists = (route: string) => {
  const p = route.split("#")[0].replace(/^\//, "");
  return fs.existsSync(path.join(appDir, p, "page.tsx"));
};
for (const t of tours) for (const r of [t.route, ...t.steps.map((s) => s.route).filter(Boolean) as string[]]) assert.ok(routeExists(r), `${t.id}: rota inexistente ${r}`);

/* ---------- Alvos existem no código (data-tour literal ou gerado por prefixo) ---------- */
const sources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(path.join(dir, e.name)) : /\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : []));
const code = sources(path.join(ROOT, "src")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
const literal = new Set([...code.matchAll(/data-tour="([a-z0-9-]+)"/g)].map((m) => m[1]));
const prefixes = new Set([...code.matchAll(/tour="([a-z0-9-]+)"/g)].map((m) => m[1]));
const generated = (id: string) =>
  [...prefixes].some((p) => ["-header", "-actions", "-table", "-search", "-filters", "-row-actions", "-view"].some((suf) => id === p + suf) || id === p) ||
  /^nav-[a-z]+$/.test(id) || /^settings-tab-[a-z]+$/.test(id) || /^incidents-tab-[a-z]+$/.test(id) || id === "payments-card-actions" || id === "requests-open";
const missing: string[] = [];
for (const t of tours) for (const s of t.steps) for (const id of [s.target, s.click].filter(Boolean) as string[]) if (!literal.has(id) && !generated(id)) missing.push(`${t.id}/${s.id}: ${id}`);
assert.deepEqual(missing, [], `alvos sem data-tour no código:\n${missing.join("\n")}`);
// Itens do menu citados pelo tour geral existem no menu.
const nav = fs.readFileSync(path.join(ROOT, "src/components/admin/nav.ts"), "utf8");
const constants = fs.readFileSync(path.join(ROOT, "src/lib/constants.ts"), "utf8");
for (const s of tours.find((t) => t.id === "conheca-seu-sistema")!.steps.filter((x) => x.target?.startsWith("nav-"))) {
  const slug = s.target!.slice(4);
  assert.ok(new RegExp(`"/admin${slug === "admin" ? "" : "/" + slug}"`).test(constants) && nav.includes("ROUTES."), `menu sem ${slug}`);
}

/* ---------- Cobertura: todo módulo do menu tem tour ---------- */
const menuRoutes = [...constants.matchAll(/(\w+): "(\/admin(?:\/[a-z]+)?)"/g)].map((m) => m[2]).filter((r) => !["/admin/login", "/admin/ajuda"].includes(r));
const uncovered = menuRoutes.filter((r) => !tours.some((t) => t.kind !== "jornada" && t.route.split("#")[0] === r));
assert.deepEqual(uncovered, [], `telas sem tour: ${uncovered.join(", ")}`);

/* ---------- Permissões e plano ---------- */
assert.equal(canTakeTour(tours.find((t) => t.id === "payments")!, as("operator")), false, "operador não faz tour de pagamentos");
assert.equal(canTakeTour(tours.find((t) => t.id === "payments")!, as("finance")), true);
assert.equal(canTakeTour(tours.find((t) => t.id === "settings-equipe")!, as("manager")), false, "gerente não gerencia equipe");
assert.equal(canTakeTour(tours.find((t) => t.id === "vehicles")!, as("viewer")), true, "leitura vê o tour de veículos");
assert.equal(visibleTours(tours, { audience: "tenant", role: null, platformAdmin: false }).length, 0, "locatário não vê tours do painel");
assert.equal(visibleTours(tours, as(null)).length, 0, "sem papel carregado: nenhum tour");
const general = tours.find((t) => t.id === "conheca-seu-sistema")!;
const opSteps = tourSteps(general, as("operator"), "full").map((s) => s.id);
assert.ok(!opSteps.includes("nav-pagamentos") && !opSteps.includes("nav-settings"), "operador não é levado a telas sem permissão");
assert.ok(opSteps.includes("nav-rentals"));

// Rastreamento ligado/desligado no plano.
assert.equal(canTakeTour(tours.find((t) => t.id === "monitoring")!, as("owner", { tracking: false })), false, "plano sem rastreamento esconde o tour");
assert.equal(canTakeTour(tours.find((t) => t.id === "monitoring")!, as("owner", { tracking: true })), true);
assert.ok(!tourSteps(general, as("owner", { tracking: false }), "full").some((s) => s.id === "nav-monitoring"), "tour geral pula rastreamento fora do plano");
assert.ok(tourSteps(general, as("owner", { tracking: true }), "full").some((s) => s.id === "nav-monitoring"));

/* ---------- Modo rápido, rotas por passo, tela atual ---------- */
const vehicles = tours.find((t) => t.id === "vehicles")!;
assert.ok(hasQuickMode(vehicles));
assert.ok(tourSteps(vehicles, owner, "quick").length < tourSteps(vehicles, owner, "full").length);
const rental = tours.find((t) => t.id === "rentals")!;
const routes = stepRoutes(rental, rental.steps);
assert.equal(routes[0], "/admin/rentals");
assert.equal(routes[routes.length - 1], "/admin/rentals/[id]", "rota herdada pelos passos seguintes");
assert.ok(routeMatches(routes[routes.length - 1], "/admin/rentals/l01"));
assert.deepEqual(toursForRoute(tours, "/admin/settings#pagamentos", owner).map((t) => t.id), ["settings-pagamentos"]);
assert.deepEqual(toursForRoute(tours, "/admin/vehicles", owner).map((t) => t.id), ["vehicles"]);
assert.equal(brandText("Bem-vindo à {org}", "Frota Exemplo"), "Bem-vindo à Frota Exemplo");
assert.equal(brandText("Bem-vindo à {org}", ""), "Bem-vindo à sua locadora");

/* ---------- Busca encontra tours em linguagem do cliente ---------- */
assert.ok(searchTours(tours, "cadastrar carro").slice(0, 2).some((r) => r.tour.id === "vehicles"), "cadastrar carro encontra o tour de Veículos");
assert.ok(searchTours(tours, "como alugar um carro").slice(0, 3).some((r) => r.tour.id === "rentals" || r.tour.id === "jornada-primeira-locacao"));
assert.ok(searchTours(tours, "receber do cliente").slice(0, 3).some((r) => r.tour.module === "pagamentos"));
assert.ok(searchTours(tours, "conserto").slice(0, 2).some((r) => r.tour.id === "maintenance"));

/* ---------- Progresso: iniciar, pausar, retomar, concluir, pular ---------- */
let st = startTour(emptyTourState(), vehicles, "full");
st = moveTour(st, "vehicles", 3);
st = moveTour(st, "vehicles", 4);
st = pauseTour(st, "vehicles");
assert.equal(st.tours.vehicles.status, "paused");
assert.equal(st.tours.vehicles.step, 4, "retoma no passo onde parou");
assert.equal(tourStatus(st.tours.vehicles, vehicles), "in_progress");
st = startTour(st, vehicles, "full", st.tours.vehicles.step);
assert.equal(st.tours.vehicles.step, 4);
st = completeTour(st, "vehicles", vehicles.steps.length);
assert.equal(tourStatus(st.tours.vehicles, vehicles), "done");
assert.deepEqual(st.tours.vehicles.completedVersions, [1]);
// Versão nova: histórico mantido, oferecido como "atualizado", nunca imposto.
assert.equal(tourStatus(st.tours.vehicles, { version: 2 }), "updated");
const v2 = startTour(st, { id: "vehicles", version: 2 }, "full");
assert.deepEqual(v2.tours.vehicles.completedVersions, [1], "conclusão da v1 não some");
assert.equal(tourStatus(skipTour(startTour(emptyTourState(), vehicles, "full"), "vehicles").tours.vehicles, vehicles), "new");

/* ---------- Armazenamento: vazio, corrompido, bloqueado, por usuário + locadora ---------- */
const mem = new Map<string, string>();
const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
assert.deepEqual(readTourState(null, "x"), emptyTourState());
mem.set("bad", "{nao json");
assert.deepEqual(readTourState(store, "bad"), emptyTourState());
mem.set("weird", JSON.stringify({ tours: { a: { status: "hack", step: 1 }, b: { status: "done", step: -5, version: "x" } }, prompted: [1, "vehicles"] }));
const weird = readTourState(store, "weird");
assert.ok(!weird.tours.a && weird.tours.b.step === 0 && weird.tours.b.version === 1, "descarta lixo do armazenamento");
assert.deepEqual(weird.prompted, ["vehicles"]);
assert.equal(saveTourState({ setItem: () => { throw new Error("cheio"); } }, "k", st), false, "armazenamento bloqueado não quebra");
saveTourState(store, tourStateKey("u1", "orgA"), st);
assert.ok(readTourState(store, tourStateKey("u1", "orgA")).tours.vehicles);
assert.equal(readTourState(store, tourStateKey("u1", "orgB")).tours.vehicles, undefined, "outra locadora não herda progresso");
assert.equal(readTourState(store, tourStateKey("u2", "orgA")).tours.vehicles, undefined, "outro usuário não herda progresso");
// Servidor x aparelho: vence o mais recente.
const local = moveTour(startTour(emptyTourState(), vehicles, "full"), "vehicles", 2);
const merged = mergeTourState(local, { vehicles: { ...local.tours.vehicles, step: 7, updatedAt: "2999-01-01T00:00:00.000Z" } });
assert.equal(merged.tours.vehicles.step, 7);
assert.equal(mergeTourState(local, { vehicles: { ...local.tours.vehicles, step: 9, updatedAt: "2000-01-01T00:00:00.000Z" } }).tours.vehicles.step, 2);

const steps = tours.reduce((n, t) => n + t.steps.length, 0);
console.log(`OK tours: ${tours.length} tours, ${steps} passos, alvos, rotas, permissões, plano, progresso e versões`);
