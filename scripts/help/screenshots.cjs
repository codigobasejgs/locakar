/* eslint-disable @typescript-eslint/no-require-imports -- automação de documentação com Node */
/**
 * Captura as telas REAIS do sistema para a Central de Ajuda, com dados 100% fictícios.
 *
 *   npm run help:screenshots            → todas
 *   npm run help:screenshots -- vehicles → só um módulo (pasta)
 *
 * Como funciona (sem tocar em banco, Vercel ou provedores reais):
 * 1. Sobe um Supabase FALSO local (porta 54329) servindo os dados de src/data/mock (fictícios).
 * 2. Sobe o `next dev` numa porta própria (3199) com NEXT_PUBLIC_SUPABASE_URL apontando para ele.
 * 3. O Playwright entra com login fictício, abre cada tela, aguarda carregar e captura.
 * 4. Toda requisição para fora de localhost é bloqueada; APIs do servidor recebem respostas de demonstração.
 *
 * Requisitos: playwright-core e um Chrome/Chromium (CHROME_PATH ou o Chrome padrão do Windows), sharp (já instalado).
 */
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "public/help/screenshots");
const SUPA_PORT = 54329;
const APP_PORT = Number(process.env.HELP_PORT || 3199);
const BASE = `http://localhost:${APP_PORT}`;
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const only = process.argv[2];

const req = (name) => {
  for (const p of [name, path.join(ROOT, "node_modules", name), process.env.PLAYWRIGHT_DIR && path.join(process.env.PLAYWRIGHT_DIR, name)].filter(Boolean)) {
    try { return require(p); } catch { /* tenta o próximo */ }
  }
  throw new Error(`Instale ${name} (npm i -D ${name}) ou defina PLAYWRIGHT_DIR.`);
};
const { chromium } = req("playwright-core");
const sharp = require(path.join(ROOT, "node_modules/sharp"));
const { createJiti } = require("jiti");
const jiti = createJiti(__filename, { alias: { "@/": path.join(ROOT, "src") + "/" } });

/* ---------- Dados de demonstração ---------- */
const ORG = "00000000-0000-4000-8000-0000000000aa";
const USER = { id: "00000000-0000-4000-8000-000000000001", email: "demo@locadorademo.com.br", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const JWT = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, email: USER.email, exp, role: "authenticated", aud: "authenticated" })}.demo`;
const SESSION = { access_token: JWT, refresh_token: "demo", expires_at: exp, expires_in: 86400, token_type: "bearer", user: USER };
const snake = (k) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const toRow = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [snake(k), v ?? null]));
const organization = {
  id: ORG, slug: "locadora-demo", name: "Locadora Demonstração", legal_name: "Locadora Demonstração Ltda", document: "00000000000191",
  email: "contato@locadorademo.com.br", phone: "1900000000", whatsapp: "1900000000", website: "https://exemplo.com.br",
  address: "Av. Exemplo, 100 - Centro", city: "Campinas", state: "SP", cep: "13000000", status: "active",
  branding: { displayName: "Locadora Demonstração", primary: "#2563eb", secondary: "#1e3a8a", accent: "#0ea5e9", theme: "dark" },
  texts: { welcome: "Bem-vindo à Locadora Demonstração!" }, onboarding: {}, created_at: new Date().toISOString(),
};

const FAKE = { role: "owner", modules: {}, tourProgress: [] };
async function startFakeSupabase() {
  const m = await jiti.import(path.join(ROOT, "src/data/mock/index.ts"));
  const now = new Date().toISOString();
  const T = {
    vehicles: m.seedVehicles(), clients: m.seedClients(), rentals: m.seedRentals(), reservations: m.seedReservations(),
    expenses: m.seedExpenses(), maintenance: m.seedMaintenance(), fines: m.seedFines(), notes: m.seedNotes(),
    contracts: [], email_log: [], notifications: [], notification_reads: [],
  };
  for (const k of Object.keys(T)) T[k] = T[k].map((r) => ({ created_at: now, organization_id: ORG, ...toRow(r) }));
  const settings = { company: { legalName: "Locadora Demonstração Ltda", cnpj: "00.000.000/0001-91", address: "Av. Exemplo, 100 - Centro", signerName: "Responsável Demonstração", contractCity: "Campinas/SP", email: "contato@locadorademo.com.br", contractTerms: "" }, pix: { key: "contato@locadorademo.com.br", keyType: "email", name: "Locadora Demonstração", city: "Campinas", enabled: true } };
  const rpc = {
    is_staff: true, current_org_id: ORG, is_platform_admin: true,
    current_membership: { organization_id: ORG, role: "owner", status: "active" },
  };
  const server = http.createServer((q, s) => {
    const u = new URL(q.url, "http://x");
    const send = (code, body, headers = {}) => {
      s.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...headers });
      s.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (q.method === "OPTIONS") return send(204);
    if (u.pathname.startsWith("/auth/v1/token")) return send(200, SESSION);
    if (u.pathname.startsWith("/auth/v1/user")) return send(200, USER);
    if (u.pathname.startsWith("/auth/v1/logout")) return send(204);
    if (u.pathname.includes("/.well-known/jwks")) return send(200, { keys: [] });
    // Papel e plano ajustáveis pelo E2E (FAKE.role / FAKE.modules); capturas usam dono com tudo liberado.
    if (u.pathname === "/rest/v1/rpc/current_membership") return send(200, { ...rpc.current_membership, role: FAKE.role });
    if (u.pathname.startsWith("/rest/v1/rpc/")) return send(200, rpc[u.pathname.slice(13)] ?? null);
    const t = u.pathname.replace("/rest/v1/", "");
    const single = (q.headers.accept || "").includes("vnd.pgrst.object");
    if (t === "settings") return send(200, single ? { data: settings } : [{ data: settings }]);
    if (t === "organizations") return send(200, single ? organization : [organization]);
    if (t === "memberships") return send(200, [{ organization_id: ORG, role: "owner", organizations: organization }]);
    // maybeSingle() pede lista e escolhe a primeira linha no cliente.
    if (t === "subscriptions") { const sub = { plans: { entitlements: { modules: FAKE.modules } } }; return send(200, single ? sub : [sub]); }
    if (t === "tour_events") return send(201, single ? {} : []);
    if (t === "tour_progress") {
      if (q.method === "GET") return send(200, FAKE.tourProgress);
      let body = "";
      q.on("data", (c) => (body += c));
      return q.on("end", () => {
        try {
          for (const r of [].concat(JSON.parse(body || "[]"))) FAKE.tourProgress = [...FAKE.tourProgress.filter((x) => x.tour_id !== r.tour_id), r];
        } catch { /* ok */ }
        send(201, []);
      });
    }
    const rows = T[t] ?? [];
    if (q.method !== "GET") return send(200, single ? rows[0] ?? {} : []);
    const id = u.searchParams.get("id");
    const out = id ? rows.filter((r) => `eq.${r.id}` === id) : rows;
    return send(200, single ? out[0] ?? null : out, { "content-range": `0-${Math.max(out.length - 1, 0)}/${out.length}` });
  });
  await new Promise((r) => server.listen(SUPA_PORT, r));
  return server;
}

/* ---------- Respostas de demonstração para as APIs do próprio sistema ---------- */
const today = new Date().toISOString().slice(0, 10);
const API = {
  "/api/org": { org: organization, role: "owner", members: [{ user_id: USER.id, role: "owner", created_at: today }], invites: [{ id: "i1", email: "operador@locadorademo.com.br", role: "operator", created_at: today, expires_at: new Date(Date.now() + 5 * 864e5).toISOString() }], subscription: null },
  "/api/payments/methods": { methods: [
    { id: "pix_manual", enabled: true, configured: true, status: "active", open: 1 },
    { id: "infinitepay", enabled: false, configured: true, status: "inactive", open: 0 },
    { id: "asaas", enabled: false, configured: false, status: "not_configured", detail: "Cadastre e teste a API Key.", open: 0 },
  ] },
  "/api/payments/receipt": { receipts: [{ id: "pr1", rentalId: "l05", clientName: "Eduarda Martins Costa", amount: 650, installment: { number: 4, dueDate: today, amount: 650 }, createdAt: new Date().toISOString(), imageUrl: null }] },
  "/api/asaas/config": { migrationReady: true, masterKeyReady: true, enabled: false, environment: "sandbox", configured: false, maskedKey: null, verifiedAt: null, webhookConfigured: false, keys: { sandbox: { configured: false, maskedKey: null, verifiedAt: null, webhook: false }, production: { configured: false, maskedKey: null, verifiedAt: null, webhook: false } }, methods: ["PIX", "BOLETO", "CREDIT_CARD"], allowUndefined: true, finePercent: null, interestPercent: null, discountPercent: null, discountDays: null, notifyAsaas: false, notifyWhatsapp: true, notifyEmail: false, lastError: null, webhookUrl: "https://exemplo.com.br/api/webhooks/asaas?o=demo" },
  "/api/asaas/charges": { config: { ready: false }, charges: {} },
  "/api/fipe/config": { installed: true, enabled: true, autoUpdate: true, configured: false, maskedKey: null, verifiedAt: today, lastError: null, lastAutoAt: null, masterKeyReady: true },
  "/api/selsyn/status": { configured: false, databaseReady: true, refreshSeconds: 120, lastRequest: null },
  "/api/whatsapp": { configured: true, connected: true, number: "551900000000", profileName: "Locadora Demonstração" },
  "/api/contracts/templates": { templates: [{ id: "t1", name: "Contrato Semanal Padrão", rental_type: "Semanal", file_name: "contrato-semanal.docx", file_path: "demo", file_type: "docx", status: "configured", current_version: 1, mapping: new Array(12).fill(0).map((_, i) => ({ id: String(i) })), manual_fields: [] }] },
  "/api/payments/infinitepay": { state: "configured", handle: "locadorademo", webhookUrl: "https://exemplo.com.br/api/webhooks/infinitepay", redirectUrl: "https://exemplo.com.br/pagamento/infinitepay", tapResultUrl: "https://exemplo.com.br/api/payments/infinitepay/tap", lastTransaction: null, lastWebhookAt: null, lastError: null },
  "/api/tenant-admin?view=requests": { requests: [{ id: "req00001demo", clientId: "c10", clientName: "João Pedro Almeida", clientPhone: "(19) 90000-1999", clientEmail: "joao.demo@exemplo.com", clientCpf: "***.***.***-00", clientCode: 10, vehicleId: "v08", vehicleName: "RENAULT KWID ZEN", vehiclePlate: "LKR7H59", vehicleImage: null, vehicleStatus: "available", startDate: today, endDate: today, planType: "weekly", rateAmount: 700, depositAmount: 1000, cnhNumber: "00000000000", cnhCategory: "B", cnhExpiry: "2030-01-01", status: "pending", rejectionReason: null, correctionNotes: null, createdRentalId: null, createdAt: new Date().toISOString(), cnhFrontUrl: null, cnhBackUrl: null, addressProofUrl: null, selfieUrl: null }] },
  "/api/tenant-admin?view=incidents": { incidents: [{ id: "oc1", rentalId: "l01", clientName: "Ana Beatriz Moreira", vehicle: "FIAT MOBI · LKR0A10", category: "tire", description: "Pneu dianteiro direito furou. Estou no posto da avenida principal.", status: "open", adminNotes: null, createdAt: new Date().toISOString(), photos: [] }] },
  "/api/tenant-admin?view=documents": { documents: [{ id: "d1", clientName: "Bruno Carvalho Lima", kind: "cnh_front", status: "pending_review", rejectionReason: null, createdAt: new Date().toISOString(), url: null }] },
  "/api/tenant-admin?view=security": { clients: [{ clientId: "c01", clientName: "Ana Beatriz Moreira", score: 12, level: "low", factors: [], lastSeen: new Date().toISOString(), ips: ["203.0.113.10"], devices: ["Android · Demo"], integrity: null, emulator: false, history: [{ at: new Date().toISOString(), score: 12, ip: null }], consent: { version: "1", scopes: ["essential"], at: new Date().toISOString() } }], devices: [{ clientName: "Ana Beatriz Moreira", installationId: "demo", platform: "android", model: "Demo", os: "14", appVersion: "1.0.0", active: true, push: true, lastSeen: new Date().toISOString() }], audit: [{ id: 1, actor: "Ana Beatriz Moreira", action: "payment_receipt.submitted", entity: "payment_receipt", ip: "203.0.113.10", at: new Date().toISOString() }] },
  "/api/platform/admin": { me: USER.id, organizations: [{ id: ORG, slug: "locadora-demo", name: "Locadora Demonstração", legal_name: null, document: null, email: "contato@locadorademo.com.br", phone: null, whatsapp: null, status: "active", created_at: today, plan_id: "completo", trial_ends_at: null, owner_email: USER.email, users: 2, vehicles: 10, clients: 10, active_rentals: 6, is_default: true }, { id: "00000000-0000-4000-8000-0000000000bb", slug: "frota-exemplo", name: "Frota Exemplo", legal_name: null, document: null, email: "contato@frotaexemplo.com.br", phone: null, whatsapp: null, status: "trial", created_at: today, plan_id: "trial", trial_ends_at: new Date(Date.now() + 18 * 864e5).toISOString(), owner_email: "dono@frotaexemplo.com.br", users: 1, vehicles: 3, clients: 2, active_rentals: 1, is_default: false }], plans: [{ id: "completo", name: "Completo" }, { id: "trial", name: "Teste grátis" }], admins: [{ user_id: USER.id, email: USER.email, created_at: today }], config: { trial_days: 30, grace_days: 7 }, audit: [] },
};

/* ---------- Telas a capturar ---------- */
const D = { w: 1440, h: 900 };
const SHOTS = [
  { file: "dashboard/overview", path: "/admin" },
  { file: "dashboard/onboarding", path: "/admin", clip: "section" },
  { file: "vehicles/list", path: "/admin/vehicles" },
  { file: "vehicles/form", path: "/admin/vehicles", click: "text=Novo veículo" },
  { file: "clients/list", path: "/admin/clients" },
  { file: "clients/form", path: "/admin/clients", click: "text=Novo cliente" },
  { file: "reservations/list", path: "/admin/reservations" },
  { file: "reservations/form", path: "/admin/reservations", click: "text=Nova reserva" },
  { file: "rentals/list", path: "/admin/rentals" },
  { file: "rentals/form", path: "/admin/rentals", click: "text=Nova locação" },
  { file: "rentals/details", path: "/admin/rentals/l01" },
  { file: "requests/list", path: "/admin/requests" },
  { file: "requests/details", path: "/admin/requests", click: "text=Analisar e aprovar" },
  { file: "payments/list", path: "/admin/pagamentos" },
  { file: "payments/settle", path: "/admin/pagamentos", click: "button:has-text('Dar baixa')" },
  { file: "payments/charge", path: "/admin/pagamentos", click: "button:has-text('Cobrar')" },
  { file: "payments/receipt-review", path: "/admin/finance", click: "text=Conferir" },
  { file: "finance/overview", path: "/admin/finance" },
  { file: "expenses/list", path: "/admin/expenses" },
  { file: "expenses/form", path: "/admin/expenses", click: "text=Nova despesa" },
  { file: "maintenance/list", path: "/admin/maintenance" },
  { file: "maintenance/form", path: "/admin/maintenance", click: "text=Nova manutenção" },
  { file: "fines/list", path: "/admin/fines" },
  { file: "fines/form", path: "/admin/fines", click: "text=Nova multa" },
  { file: "notes/list", path: "/admin/notes" },
  { file: "notes/form", path: "/admin/notes", click: "text=Nova anotação" },
  { file: "incidents/overview", path: "/admin/incidents" },
  { file: "security/overview", path: "/admin/security" },
  { file: "monitoring/overview", path: "/admin/monitoring" },
  { file: "reports/overview", path: "/admin/reports" },
  { file: "settings/company", path: "/admin/settings#empresa" },
  { file: "settings/branding", path: "/admin/settings#aparencia" },
  { file: "settings/team", path: "/admin/settings#equipe" },
  { file: "settings/texts", path: "/admin/settings#textos" },
  { file: "settings/contracts", path: "/admin/settings#contratos" },
  { file: "settings/payments", path: "/admin/settings#pagamentos" },
  { file: "settings/payment-methods", path: "/admin/settings#pagamentos", clip: "#config-meios" },
  { file: "settings/infinitepay", path: "/admin/settings#pagamentos", clip: "#config-infinitepay" },
  { file: "settings/asaas", path: "/admin/settings#pagamentos", clip: "#config-asaas" },
  { file: "settings/fipe", path: "/admin/settings#integracoes" },
  { file: "settings/whatsapp", path: "/admin/settings#integracoes", scroll: 900 },
  { file: "settings/push", path: "/admin/settings#preferencias", scroll: 500 },
  { file: "platform/overview", path: "/plataforma/admin" },
];

async function waitForServer(url, ms = 180000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Servidor não respondeu em ${url}`);
}

async function save(png, file) {
  const dest = path.join(OUT, file + ".webp");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await sharp(png).webp({ quality: 78 }).toFile(dest);
  return path.relative(ROOT, dest).replaceAll("\\", "/");
}

/** Ambiente isolado: Supabase falso + next dev com credenciais reais removidas. Reusado pelo E2E do tour. */
async function startEnv() {
  const supa = await startFakeSupabase();
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://localhost:${SUPA_PORT}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_demo", HELP_DIST_DIR: ".next-help", NEXT_TELEMETRY_DISABLED: "1" };
  // Remove credenciais reais do processo de captura: nada sai para Supabase/Resend/Evolution de verdade.
  for (const k of ["SUPABASE_SECRET_KEY", "RESEND_API_KEY", "EVOLUTION_API_URL", "EVOLUTION_API_KEY", "ASAAS_ENCRYPTION_KEY", "SELSYN_API_KEY"]) delete env[k];
  const dev = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "dev", "-p", String(APP_PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  dev.stderr.on("data", (d) => process.env.HELP_DEBUG && process.stderr.write(d));
  await waitForServer(`${BASE}/admin/login`);
  return { supa, dev };
}
/** Rotas de rede do painel: nada sai da máquina; APIs do sistema recebem respostas de demonstração. */
const adminRoutes = (route) => {
  const u = new URL(route.request().url());
  if (u.hostname !== "localhost") return route.abort();
  if (u.port === String(APP_PORT) && u.pathname.startsWith("/api/")) return route.fulfill({ json: API[u.pathname + u.search] ?? API[u.pathname] ?? {} });
  return route.continue();
};
async function login(page) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill("#email", USER.email);
  await page.fill("#password", "demo-senha");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60000 });
}
module.exports = { FAKE, chromium, startEnv, adminRoutes, login, USER, ORG, BASE, APP_PORT, SUPA_PORT, CHROME };

if (require.main === module) (async () => {
  const { supa, dev } = await startEnv();
  const manifest = [];
  let browser;
  try {
    browser = await chromium.launch({ executablePath: CHROME });
    const ctx = await browser.newContext({ viewport: { width: D.w, height: D.h }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem("locakar-admin-theme", "dark"); } catch { /* ok */ } });
    await ctx.route("**/*", adminRoutes);
    const page = await ctx.newPage();
    await login(page);

    for (const s of SHOTS.filter((s) => !only || s.file.startsWith(only + "/"))) {
      await page.goto(BASE + s.path, { waitUntil: "networkidle" }).catch(() => {});
      await page.addStyleTag({ content: "nextjs-portal,[data-sonner-toaster]{display:none!important} *{animation:none!important;transition:none!important}" });
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(1500);
      if (s.click) { await page.locator(s.click).first().click({ timeout: 8000 }).catch(() => console.warn(`  (sem ${s.click})`)); await page.waitForTimeout(900); }
      if (s.scroll) { await page.mouse.wheel(0, s.scroll); await page.waitForTimeout(500); }
      const target = s.clip ? page.locator(s.clip).first() : null;
      const png = target && (await target.count()) ? await target.screenshot() : await page.screenshot();
      const rel = await save(png, s.file);
      manifest.push({ id: s.file, route: s.path, viewport: s.clip ? "element" : `${D.w}x${D.h}`, theme: "dark", state: s.click ?? s.clip ?? "tela", capturedAt: new Date().toISOString(), file: rel });
      console.log("ok", s.file);
    }

    // App do locatário (export web) em celular — respostas fictícias, sem rede externa.
    if (!only || only === "app") {
      const inst = (n, due, paid, late) => ({ id: "i" + n, label: `Semana ${n}`, dueDate: due, amount: 650, paid, paidAt: paid ? due : null, amountPaid: paid ? 650 : null, late, fee: late ? 13 : 0, interest: late ? 6.5 : 0, total: late ? 669.5 : 650, pixCode: "00020126demo", proofStatus: null, rejectionReason: null });
      const summary = { client: { id: "c1", name: "Mariana Exemplo", cpf: "00000000000", email: "cliente@exemplo.com", phone: "(19) 90000-0000", cnhExpiry: "2030-01-01", cnhNumber: "00000000000", cnhCategory: "B" }, fleet: [], pix: { name: "Locadora Demonstração" }, support: { whatsapp: "5519000000000", display: "(19) 0000-0000" }, today, privacyVersion: "1", consent: { scopes: ["push"], at: today }, pendingRequest: null, brand: { name: "Locadora Demonstração" },
        rentals: [{ id: "r1", status: "active", startDate: today, endDate: today, contractType: "Semanal", deposit: 1000, kmStart: 45230, kmEnd: null, delivery: null, returned: null, vehicle: { id: "v1", name: "FIAT MOBI LIKE 1.0", brand: "Fiat", model: "Mobi", year: 2023, yearModel: "2023", plate: "LKR0A10", fuel: "Flex", transmission: "Manual", seats: 5, category: "Hatch" }, billing: { period: "weekly", amount: 650, firstDue: today, until: today, lateFeePercent: 2, interestPercent: 1, interestPeriod: "daily", graceDays: 0 }, installments: [inst(1, today, true, false), inst(2, today, false, true), inst(3, today, false, false)] }] };
      const appCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      await appCtx.addInitScript((s) => { try { for (const k of Object.keys(localStorage)) if (k.startsWith("sb-")) localStorage.removeItem(k); localStorage.setItem("sb-hhqtpsqcurjwnubfoeuv-auth-token", s); localStorage.setItem("sb-localhost-auth-token", s); } catch { /* ok */ } }, JSON.stringify(SESSION));
      await appCtx.route("**/*", (route) => {
        const u = new URL(route.request().url());
        // O build web do app aponta para o Supabase real: responde aqui mesmo, a requisição nunca sai da máquina.
        if (u.hostname.endsWith(".supabase.co")) return route.fulfill({ json: u.pathname.includes("/auth/v1/user") ? USER : {} });
        // A API do app aponta para o domínio de produção: respondemos aqui, nada sai da máquina.
        const local = u.hostname === "localhost" || u.hostname.endsWith("locakar.com.br");
        if (!local) return route.abort();
        if (u.hostname !== "localhost" && !u.pathname.startsWith("/api/")) return route.abort();
        if (u.pathname.includes("/api/tenant/summary")) return route.fulfill({ json: summary });
        if (u.pathname.includes("/api/public/org/")) return route.fulfill({ json: { slug: "locadora-demo", name: "Locadora Demonstração", primary: "#2563eb", secondary: "#1e3a8a", accent: "#0ea5e9", theme: "dark", active: true } });
        const appApi = {
          "/api/tenant/vehicle": { maintenance: [{ id: "m1", date: today, description: "Troca de óleo programada", nextKm: 55000, status: "scheduled" }], fines: [] },
          "/api/tenant/inspections": { inspections: [] },
          "/api/tenant/incidents": { incidents: [] },
          "/api/tenant/documents": { documents: [] },
          "/api/tenant/reservations": { reservations: [], fleet: [] },
        }[u.pathname];
        if (u.pathname.includes("/api/")) return route.fulfill({ json: appApi ?? {} });
        return route.continue();
      });
      const ap = await appCtx.newPage();
      for (const [file, route] of [["login", "login"], ["pagamentos", "pagamentos"], ["vistoria", "veiculo"], ["ocorrencias", "ocorrencias"], ["documentos", "documentos"]]) {
        await ap.goto(`${BASE}/locatario/${route}?org=locadora-demo`).catch(() => {});
        await ap.waitForTimeout(3500);
        const rel = await save(await ap.screenshot(), `app/${file}`);
        manifest.push({ id: `app/${file}`, route: `/locatario/${route}`, viewport: "390x844", theme: "dark", state: "app", capturedAt: new Date().toISOString(), file: rel });
        console.log("ok", `app/${file}`);
      }
      // Assinatura pública de contrato (sem contrato real: a tela de link inválido é real e não expõe dados)
      await ap.goto(`${BASE}/assinar/demo-token`).catch(() => {});
      await ap.waitForTimeout(2500);
      const rel = await save(await ap.screenshot(), "contracts/sign");
      manifest.push({ id: "contracts/sign", route: "/assinar/[token]", viewport: "390x844", theme: "dark", state: "link sem contrato", capturedAt: new Date().toISOString(), file: rel });
      console.log("ok contracts/sign");
    }

    const mPath = path.join(OUT, "manifest.json");
    const prev = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, "utf8")) : [];
    const merged = [...prev.filter((p) => !manifest.some((m) => m.id === p.id)), ...manifest].sort((a, b) => a.id.localeCompare(b.id));
    fs.writeFileSync(mPath, JSON.stringify(merged, null, 2) + "\n");
    console.log(`${manifest.length} capturas · manifest: public/help/screenshots/manifest.json`);
  } finally {
    await browser?.close();
    dev.kill();
    supa.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
