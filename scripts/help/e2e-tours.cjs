/* eslint-disable @typescript-eslint/no-require-imports -- teste ponta a ponta com Node + Playwright */
/**
 * E2E do tour guiado na interface REAL, com dados fictícios e Supabase falso (nada sai da máquina).
 *
 *   npm run help:e2e
 *
 * Cobre: tour geral completo, Veículos (com formulário), Locações (até os detalhes), Pagamentos, Configurações,
 * celular (menu e folha inferior), tema claro, papel operador, plano sem rastreamento, retomada e Esc.
 * Verifica que nenhum dado é gravado: só leituras e eventos de tour chegam ao Supabase falso.
 */
const assert = require("node:assert/strict");
const env = require("./screenshots.cjs");
const { FAKE, chromium, CHROME, BASE } = env;

const writes = [];
// npm run help:e2e -- 7 8  → só os cenários 7 e 8.
const only = process.argv.slice(2).map(Number);
const want = (n) => !only.length || only.includes(n);
const step = async (page) => {
  await page.waitForSelector("#tour-title", { timeout: 20000 });
  return {
    title: (await page.textContent("#tour-title")).trim(),
    counter: (await page.textContent(".tour-pop [aria-live]")).trim(),
    spot: await page.locator(".tour-spot").count(),
  };
};
const next = async (page) => {
  const before = await page.textContent(".tour-pop [aria-live]");
  await page.locator(".tour-pop button", { hasText: /^(Próximo|Concluir)/ }).click();
  await page.waitForFunction((b) => document.querySelector(".tour-pop [aria-live]")?.textContent !== b || !document.querySelector(".tour-pop[role=dialog]"), before, { timeout: 20000 }).catch(() => {});
};
/** Avança até concluir; confere que o balão fica dentro da tela e que o destaque existe quando há alvo. */
async function runToEnd(page, label, vw) {
  const seen = [];
  for (let i = 0; i < 60; i++) {
    const s = await step(page);
    seen.push(s.title);
    await page.waitForTimeout(120); // um quadro para o balão assentar após a rolagem
    const box = await page.locator(".tour-pop[role=dialog]").boundingBox();
    assert.ok(box && box.x >= -1 && box.x + box.width <= vw + 1, `${label}: balão fora da tela em "${s.title}" ${JSON.stringify(box)} innerWidth=${await page.evaluate(() => innerWidth)}`);
    const [n, total] = s.counter.split(" ·")[0].split(" de ").map(Number);
    if (n === total) {
      await next(page);
      await page.waitForSelector("text=Treinamento concluído", { timeout: 10000 });
      return seen;
    }
    await next(page);
  }
  throw new Error(`${label}: não terminou`);
}
const closeCompletion = (page) => page.locator("[role=alertdialog] button", { hasText: "Fechar" }).click();

async function newPage(browser, { width = 1440, height = 900, theme = "dark", state, keepProgress } = {}) {
  // Cada cenário começa sem progresso no servidor falso (o progresso é salvo lá, como no Supabase real).
  if (!keepProgress) FAKE.tourProgress = [];
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(([t, s]) => {
    try {
      localStorage.setItem("locakar-admin-theme", t);
      // Pula o convite de boas-vindas nos testes de tela; o próprio convite tem um teste.
      if (s) for (const k of Object.keys(s)) localStorage.setItem(k, s[k]);
    } catch { /* ok */ }
  }, [theme, state]);
  await ctx.route("**/*", (route) => {
    const r = route.request();
    if (r.method() !== "GET" && new URL(r.url()).port === String(env.SUPA_PORT) && !/tour_(events|progress)|\/auth\/|\/rpc\//.test(r.url())) writes.push(`${r.method()} ${r.url()}`);
    if (r.method() !== "GET" && /\/api\//.test(r.url()) && !/\/api\/(org|payments\/methods)/.test(r.url())) writes.push(`${r.method()} ${r.url()}`);
    return env.adminRoutes(route);
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn("  erro na página:", e.message));
  await env.login(page);
  return page;
}
const skipWelcome = (user = "00000000-0000-4000-8000-000000000001", org = env.ORG) => ({ [`locakar:tour:v1:${user}:${org}`]: JSON.stringify({ tours: {}, prompted: ["dashboard", "vehicles", "rentals", "payments", "settings-empresa", "settings-pagamentos"], welcome: "later" }) });

const startFromHelp = async (page, path, button) => {
  await page.goto(BASE + path);
  await page.locator('[data-tour="topbar-help"]').click();
  await page.locator("[role=dialog] button", { hasText: button }).first().click();
};

(async () => {
  const { supa, dev } = await env.startEnv();
  const browser = await chromium.launch({ executablePath: CHROME });
  const results = [];
  const ok = (name, extra = "") => (results.push(name), console.log(`ok  ${name}${extra ? ` · ${extra}` : ""}`));
  try {
    // 1. Tour geral completo, a partir do convite de boas-vindas (locadora nova = sem veículos não é o caso do demo: inicia pela Central).
    if (want(1)) {
      const page = await newPage(browser, { state: skipWelcome() });
      await page.goto(`${BASE}/admin/ajuda/treinamentos`);
      await page.locator("li", { hasText: "Conheça seu sistema" }).locator("button", { hasText: "Começar" }).click();
      const seen = await runToEnd(page, "geral", 1440);
      assert.ok(seen.includes("Pagamentos") && seen.includes("Configurações") && seen.includes("Rastreamento"), "geral passa pelos módulos");
      await closeCompletion(page);
      ok("Tour geral completo", `${seen.length} passos`);
      await page.context().close();
    }
    // 2. Veículos: abre o formulário vazio, não salva, fecha ao concluir.
    if (want(2)) {
      const page = await newPage(browser, { state: skipWelcome() });
      await startFromHelp(page, "/admin/vehicles", "Treinamento completo");
      const seen = await runToEnd(page, "veículos", 1440);
      assert.ok(seen.includes("Fotos do veículo"), "veículos explica o formulário");
      await closeCompletion(page);
      assert.equal(await page.locator('[role="dialog"][data-state="open"]').count(), 0, "formulário fechado ao concluir");
      ok("Tour Veículos (formulário aberto e fechado sem salvar)", `${seen.length} passos`);
      await page.context().close();
    }
    // 3. Locações: atravessa lista → formulário → detalhes.
    if (want(3)) {
      const page = await newPage(browser, { state: skipWelcome() });
      await startFromHelp(page, "/admin/rentals", "Treinamento completo");
      const seen = await runToEnd(page, "locações", 1440);
      assert.ok(/\/admin\/rentals\/.+/.test(new URL(page.url()).pathname), "abriu os detalhes de uma locação");
      assert.ok(seen.includes("Vistorias de entrega e devolução"));
      await closeCompletion(page);
      ok("Tour Locações (lista, formulário e detalhes)", `${seen.length} passos`);
      await page.context().close();
    }
    // 4. Pagamentos + 5. Configurações (subtour com aba por hash).
    if (want(4)) {
      const page = await newPage(browser, { state: skipWelcome() });
      await startFromHelp(page, "/admin/pagamentos", "Treinamento completo");
      ok("Tour Pagamentos", `${(await runToEnd(page, "pagamentos", 1440)).length} passos`);
      await closeCompletion(page);
      await startFromHelp(page, "/admin/settings#pagamentos", "Treinamento completo");
      const seen = await runToEnd(page, "configurações", 1440);
      assert.ok(seen.includes("PIX manual"));
      await closeCompletion(page);
      ok("Tour Configurações: Pagamentos", `${seen.length} passos`);
      await page.context().close();
    }
    // 6. Retomada: para no passo 3, fecha com Esc → "Salvar e sair", volta e continua do mesmo passo.
    if (want(6)) {
      const page = await newPage(browser, { state: skipWelcome() });
      await startFromHelp(page, "/admin/clients", "Treinamento completo");
      await step(page);
      await next(page);
      await next(page);
      const at = await step(page);
      await page.keyboard.press("Escape");
      await page.locator("[role=alertdialog] button", { hasText: "Salvar e sair" }).click();
      assert.equal(await page.locator(".tour-pop[role=dialog]").count(), 0);
      await page.goto(`${BASE}/admin/clients`);
      await page.locator('[data-tour="topbar-help"]').click();
      await page.locator("[role=dialog] button", { hasText: "Continuar treinamento" }).click();
      const back = await step(page);
      assert.equal(back.counter.split(" ·")[0], at.counter.split(" ·")[0], "retomou no mesmo passo");
      ok("Retomada (Esc, Salvar e sair, Continuar)", at.counter.split(" ·")[0]);
      await page.context().close();
    }
    // 7. Celular 390px: folha inferior, menu aberto pelo tour, nada fora da tela.
    if (want(7)) {
      const page = await newPage(browser, { width: 390, height: 844, state: skipWelcome() });
      await page.goto(`${BASE}/admin/ajuda/treinamentos`);
      await page.locator("li", { hasText: "Conheça seu sistema" }).locator("button", { hasText: "Rápido" }).click();
      await step(page);
      await next(page);
      const s = await step(page);
      assert.equal(s.spot, 1, "item do menu destacado no celular (menu aberto pelo tour)");
      const box = await page.locator(".tour-pop[role=dialog]").boundingBox();
      assert.ok(box.width >= 380 && box.y + box.height <= 845, "folha inferior no celular");
      await runToEnd(page, "geral-celular", 390);
      await closeCompletion(page);
      ok("Celular 390×844 (folha inferior e menu)");
      await page.context().close();
    }
    // 8. Tema claro e tablet.
    if (want(8)) for (const [w, h, theme] of [[1024, 768, "light"], [768, 1024, "dark"], [1920, 1080, "light"]]) {
      const page = await newPage(browser, { width: w, height: h, theme, state: skipWelcome() });
      await startFromHelp(page, "/admin", "Tour rápido");
      await runToEnd(page, `dashboard-${w}`, w);
      await closeCompletion(page);
      ok(`Dashboard ${w}×${h} tema ${theme}`);
      await page.context().close();
    }
    // 9. Operador sem pagamentos/configurações e plano sem rastreamento.
    if (want(9)) {
      FAKE.role = "operator";
      FAKE.modules = { tracking: false };
      const page = await newPage(browser, { state: skipWelcome() });
      await page.goto(`${BASE}/admin/ajuda/treinamentos`);
      await page.waitForSelector("text=Aprenda a usar o sistema");
      assert.equal(await page.locator("li", { hasText: "Configurações: Pagamentos" }).count(), 0, "operador não vê tour de configurações");
      assert.equal(await page.locator("li", { hasText: /^Rastreamento/ }).count(), 0, "plano sem rastreamento esconde o tour");
      await page.locator("li", { hasText: "Conheça seu sistema" }).locator("button", { hasText: "Começar" }).click();
      const seen = await runToEnd(page, "geral-operador", 1440);
      assert.ok(!seen.includes("Pagamentos") && !seen.includes("Configurações") && !seen.includes("Rastreamento"), "tour geral adaptado ao operador");
      ok("Permissão (operador) e plano sem rastreamento", `${seen.length} passos`);
      await page.context().close();
      FAKE.role = "owner";
      FAKE.modules = {};
    }
    // 10. Convite de boas-vindas aparece uma vez e "Agora não" é respeitado (conta sem convite salvo).
    if (want(10)) {
      const page = await newPage(browser);
      // Demo já tem frota: convite de boas-vindas não aparece; o convite da tela aparece uma vez.
      await page.goto(`${BASE}/admin/vehicles`);
      const prompt = page.locator("aside", { hasText: "Quer aprender a usar esta área?" });
      // Locadora já em uso, sem nada salvo: sem boas-vindas, mas o convite da tela aparece.
      await prompt.waitFor({ timeout: 15000 });
      assert.equal(await page.locator("#tour-welcome-title").count(), 0, "conta em uso não recebe boas-vindas");
      await prompt.locator("button[aria-label='Agora não']").click();
      await page.reload();
      await page.waitForTimeout(2500);
      assert.equal(await prompt.count(), 0, "convite da tela não volta");
      ok("Convites dispensáveis (aparecem uma vez)");
      await page.context().close();
    }
    assert.deepEqual(writes, [], `o tour gravou dados:\n${writes.join("\n")}`);
    ok("Nenhum dado operacional gravado durante os tours");
    console.log(`\n${results.length} cenários E2E aprovados`);
  } finally {
    await browser.close();
    dev.kill();
    supa.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
