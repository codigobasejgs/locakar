// Motor Whaileys: API própria de WhatsApp com botões/listas, várias instâncias, cada uma com
// webhook, segredo e token próprios. Paralelo à Evolution API, sem tocar nela.
// Compatível com o Copiloto LocaKar: instâncias locakar_copilot_* usam WEBHOOK_URL/SECRET do .env.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import whaileys from "whaileys";
import pino from "pino";
import QRCode from "qrcode";

// Pacote CommonJS: no import ESM o default é o objeto de exports e a fábrica do socket fica em .default.
const { default: makeWASocket, Browsers, DisconnectReason, downloadMediaMessage, useMultiFileAuthState } = whaileys;
const { API_KEY, WEBHOOK_URL, WEBHOOK_SECRET } = process.env;
const PORT = Number(process.env.PORT || 8790);
const DATA = process.env.DATA_DIR || "/data/sessions";
// Cadastro dentro do volume já montado (não exige mudar o compose nem mover sessões pareadas).
const REGISTRY = join(DATA, ".instances.json");
if (!API_KEY || API_KEY.length < 24) {
  console.error("Configure API_KEY (>=24 caracteres).");
  process.exit(1);
}

const LEGACY = /^locakar_copilot_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NAME = /^[a-z0-9][a-z0-9_-]{2,62}$/;
const MEDIA = { audioMessage: 8, imageMessage: 8, documentMessage: 8 }; // MB
const DOC_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
// WA_LOG_LEVEL (ex.: "debug") só para diagnóstico; padrão silencioso. Nunca deixar ligado: pode logar metadados.
const logger = pino({ level: process.env.WA_LOG_LEVEL || "silent" });
const sessions = new Map(); // nome -> { sock, state, qr, pairing, me }
// ponytail: anti-loop em memória (10 min); reinício perde o cache, o sistema cliente deduplica pelo id.
const sent = new Map();
const remember = (id) => { sent.set(id, Date.now() + 600_000); for (const [k, t] of sent) if (t < Date.now()) sent.delete(k); };

const sha = (s) => createHash("sha256").update(s).digest();
const safeEq = (a, b) => timingSafeEqual(sha(a), sha(b));
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const fail = (status, message) => Object.assign(new Error(message), { status });

/* ---------- Cadastro de instâncias (arquivo no volume; token guardado só como hash) ---------- */
let registry = {}; // nome -> { webhookUrl, webhookSecret, tokenHash, createdAt }
async function loadRegistry() { try { registry = JSON.parse(await readFile(REGISTRY, "utf8")); } catch { registry = {}; } }
async function saveRegistry() { const tmp = `${REGISTRY}.tmp`; await writeFile(tmp, JSON.stringify(registry, null, 1), { mode: 0o600 }); await rename(tmp, REGISTRY); }

// Números que o sistema cliente autorizou (gestores): usados só para resolver LID → número.
const knownPhones = new Map(); // nome -> string[]
function config(name) {
  if (registry[name]) return { ...registry[name], knownPhones: knownPhones.get(name) };
  if (LEGACY.test(name) && WEBHOOK_URL && WEBHOOK_SECRET) return { webhookUrl: WEBHOOK_URL, webhookSecret: WEBHOOK_SECRET, legacy: true, knownPhones: knownPhones.get(name) };
  return null;
}
const validUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || (x.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(x.hostname)); } catch { return false; } };

/* ---------- Webhook ---------- */
async function post(cfg, body) {
  const raw = JSON.stringify(body), ts = String(Date.now());
  const sig = createHmac("sha256", cfg.webhookSecret).update(`${ts}.${raw}`).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(cfg.webhookUrl, { method: "POST", headers: { "content-type": "application/json", "x-whaileys-timestamp": ts, "x-whaileys-signature": sig }, body: raw, signal: AbortSignal.timeout(15_000) });
      if (r.status < 500) return;
    } catch { /* tenta de novo */ }
    await new Promise((s) => setTimeout(s, 1000 * 2 ** attempt));
  }
}

/**
 * Contato só por LID (privacidade nova do WhatsApp): o número real some do evento.
 * Resolve LID → número pelo próprio WhatsApp (onWhatsApp dos números já conhecidos) e preenche key.senderPn.
 * ponytail: cache em memória por sessão; reinício refaz as consultas sob demanda.
 */
async function resolvePn(s, lidJid, known) {
  const lid = lidJid.split("@")[0].split(":")[0];
  if (s.lidToPn?.has(lid)) return s.lidToPn.get(lid);
  s.lidToPn ??= new Map();
  for (const phone of known) {
    if ([...s.lidToPn.values()].includes(phone)) continue;
    const [r] = await s.sock.onWhatsApp(phone).catch(() => []);
    const l = r?.lid ? String(r.lid).split("@")[0].split(":")[0] : null;
    if (l) s.lidToPn.set(l, phone);
  }
  return s.lidToPn.get(lid) ?? null;
}

async function forward(name, s, msg) {
  const cfg = config(name);
  const jid = msg.key?.remoteJid || "";
  const why = !cfg ? "sem-config" : !msg.message ? "sem-conteudo" : !msg.key?.id ? "sem-id" : sent.has(msg.key.id) ? "eco-proprio" : /@(g\.us|broadcast|newsletter)$/.test(jid) || jid === "status@broadcast" ? "grupo/status" : null;
  if (why) {
    if (process.env.DEBUG_EVENTS === "1") console.log(JSON.stringify({ ev: "drop", why, remote: jid ? `${jid.split("@")[1]}…${jid.split("@")[0].split(":")[0].slice(-4)}` : "-", fromMe: !!msg.key?.fromMe }));
    return;
  }
  // Remetente só com LID: completa senderPn se for um número que o sistema cliente declarou conhecer.
  if (/@lid$/.test(jid) && !msg.key.fromMe && !/@s\.whatsapp\.net$/.test(msg.key.senderPn || "") && cfg.knownPhones?.length) {
    const pn = await resolvePn(s, jid, cfg.knownPhones).catch(() => null);
    if (pn) msg.key.senderPn = `${pn}@s.whatsapp.net`;
  }
  const inner = msg.message.ephemeralMessage?.message || msg.message.viewOnceMessage?.message || msg.message.viewOnceMessageV2?.message || msg.message;
  // DEBUG_EVENTS=1: formato do evento, sem conteúdo nem número completo (diagnóstico de LID).
  if (process.env.DEBUG_EVENTS === "1") {
    const tail = (j) => (j ? `${j.split("@")[1] ?? "?"}…${j.split("@")[0].split(":")[0].slice(-4)}` : "-");
    console.log(JSON.stringify({ ev: "in", inst: name.slice(-6), remote: tail(jid), fromMe: !!msg.key.fromMe, senderPn: tail(msg.key.senderPn), senderLid: tail(msg.key.senderLid), known: cfg.knownPhones?.length ?? 0, type: Object.keys(inner)[0] }));
  }
  const type = Object.keys(MEDIA).find((t) => inner[t]);
  let media;
  if (type) {
    const m = inner[type];
    const mime = String(m.mimetype || "").split(";")[0];
    const ok = type !== "documentMessage" || DOC_TYPES.has(mime);
    if (ok && Number(m.fileLength || 0) <= MEDIA[type] * 1024 * 1024) {
      try {
        const buf = await downloadMediaMessage(msg, "buffer", {}, { logger, reuploadRequest: s.sock.updateMediaMessage });
        if (buf.length <= MEDIA[type] * 1024 * 1024) media = { mimetype: mime, data: buf.toString("base64") };
      } catch { /* sem mídia: o sistema cliente avisa o usuário */ }
    }
  }
  await post(cfg, { instanceKey: name, me: s.me, key: msg.key, message: inner, pushName: msg.pushName ?? null, media });
}

/* ---------- Sessão WhatsApp ---------- */
async function start(name, phone) {
  const existing = sessions.get(name);
  if (existing?.sock && existing.state !== "closed") return existing;
  const dir = join(DATA, name);
  await mkdir(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const sock = makeWASocket({ auth: state, logger, browser: Browsers.ubuntu("Whaileys API"), markOnlineOnConnect: false, syncFullHistory: false, printQRInTerminal: false });
  const s = { sock, state: "connecting", qr: null, pairing: null, me: null };
  sessions.set(name, s);
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (u) => {
    if (u.qr) s.qr = await QRCode.toDataURL(u.qr).catch(() => null);
    if (u.connection === "open") { s.state = "open"; s.qr = null; s.pairing = null; s.me = { id: sock.user?.id ?? null, lid: sock.authState?.creds?.me?.lid ?? null }; }
    if (u.connection === "close") {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      s.state = "closed";
      if (code === DisconnectReason.loggedOut) { sessions.delete(name); await rm(dir, { recursive: true, force: true }); }
      else if (config(name)) setTimeout(() => start(name).catch(() => {}), code === DisconnectReason.restartRequired ? 500 : 5000);
    }
  });
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const m of messages) forward(name, s, m).catch((e) => console.error(JSON.stringify({ ev: "forward-error", error: String(e?.message ?? e).slice(0, 200) })));
  });
  if (phone && !state.creds.registered) {
    await new Promise((r) => setTimeout(r, 1500));
    s.pairing = await sock.requestPairingCode(phone).catch(() => null);
  }
  return s;
}

async function stop(name) {
  const s = sessions.get(name);
  await s?.sock.logout().catch(() => {});
  s?.sock.end?.(undefined);
  sessions.delete(name);
  await rm(join(DATA, name), { recursive: true, force: true });
}

const status = (name) => {
  const s = sessions.get(name);
  return { instance: name, state: s?.state ?? "disconnected", qr: s?.qr ?? null, pairingCode: s?.pairing ?? null, me: s?.me ?? null };
};

async function send(name, body) {
  const s = sessions.get(name);
  if (s?.state !== "open") throw fail(409, "Sessão desconectada.");
  const raw = String(body.to || "");
  // Aceita número puro (5511999999999) ou JID completo.
  const to = /^\d{10,15}$/.test(raw) ? `${raw}@s.whatsapp.net` : raw;
  if (!/^\d{10,15}@s\.whatsapp\.net$|^\d{5,20}@lid$/.test(to)) throw fail(400, "Destino inválido.");
  const text = String(body.text || "").slice(0, 4000);
  if (!text) throw fail(400, "Texto obrigatório.");
  let content = { text };
  if (Array.isArray(body.sections) && body.sections.length) {
    content = { text, buttonText: String(body.buttonText || "Abrir opções").slice(0, 20), title: String(body.title || "").slice(0, 60), footer: body.footer ? String(body.footer).slice(0, 60) : undefined,
      sections: body.sections.slice(0, 10).map((sec) => ({ title: String(sec.title || "").slice(0, 24), rows: (sec.rows || []).slice(0, 10).map((r) => ({ rowId: String(r.id).slice(0, 200), title: String(r.title).slice(0, 24), description: r.description ? String(r.description).slice(0, 72) : undefined })) })) };
  } else if (Array.isArray(body.buttons) && body.buttons.length) {
    content = { text, footer: body.footer ? String(body.footer).slice(0, 60) : undefined, buttons: body.buttons.slice(0, 3).map((b) => ({ buttonId: String(b.id).slice(0, 200), buttonText: { displayText: String(b.title).slice(0, 20) } })) };
  }
  let msg;
  try { msg = await s.sock.sendMessage(to, content); }
  catch { msg = await s.sock.sendMessage(to, { text }); } // fallback: texto puro (o cliente deve numerar as opções no texto)
  remember(msg.key.id);
  return { messageId: msg.key.id };
}

/* ---------- Autorização ---------- */
const isAdmin = (k) => safeEq(k, API_KEY);
function canUse(name, k) {
  if (isAdmin(k)) return true; // admin e o LocaKar (legado) usam a API_KEY
  const cfg = registry[name];
  return Boolean(cfg?.tokenHash && k && safeEq(sha(k).toString("hex"), cfg.tokenHash));
}

async function readBody(req) {
  let raw = "";
  for await (const c of req) { raw += c; if (raw.length > 64_000) throw fail(413, "payload"); }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw fail(400, "JSON inválido."); }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/health") return json(res, 200, { ok: true, instances: sessions.size });
    const key = String(req.headers["x-api-key"] || "");

    // Administração: criar/listar/remover instâncias (somente API_KEY).
    if (url.pathname === "/instances") {
      if (!isAdmin(key)) return json(res, 401, { error: "unauthorized" });
      if (req.method === "GET") return json(res, 200, Object.keys(registry).map((n) => ({ instance: n, webhookUrl: registry[n].webhookUrl, createdAt: registry[n].createdAt, state: sessions.get(n)?.state ?? "disconnected" })));
      if (req.method === "POST") {
        const body = await readBody(req);
        const name = String(body.name || "");
        if (!NAME.test(name) || LEGACY.test(name)) throw fail(400, "Nome inválido: 3-63 caracteres, minúsculas, números, _ ou -.");
        if (registry[name]) throw fail(409, "Instância já existe. Use PATCH /instances/<nome> para trocar o webhook.");
        if (!validUrl(body.webhookUrl)) throw fail(400, "webhookUrl precisa ser https.");
        const token = randomBytes(32).toString("hex"), webhookSecret = randomBytes(32).toString("hex");
        registry[name] = { webhookUrl: body.webhookUrl, webhookSecret, tokenHash: sha(token).toString("hex"), createdAt: new Date().toISOString() };
        await saveRegistry();
        // Token e segredo aparecem uma única vez: guarde no .env do sistema cliente.
        return json(res, 201, { instance: name, token, webhookSecret, webhookUrl: body.webhookUrl });
      }
      return json(res, 405, { error: "method" });
    }
    const adm = url.pathname.match(/^\/instances\/([^/]+)$/);
    if (adm) {
      if (!isAdmin(key)) return json(res, 401, { error: "unauthorized" });
      const name = adm[1];
      if (!registry[name]) return json(res, 404, { error: "not found" });
      if (req.method === "DELETE") { await stop(name); delete registry[name]; await saveRegistry(); return json(res, 200, { ok: true }); }
      if (req.method === "PATCH") {
        const body = await readBody(req);
        if (body.webhookUrl !== undefined && !validUrl(body.webhookUrl)) throw fail(400, "webhookUrl precisa ser https.");
        if (body.webhookUrl) registry[name].webhookUrl = body.webhookUrl;
        const out = { instance: name, webhookUrl: registry[name].webhookUrl };
        if (body.rotateToken) { const token = randomBytes(32).toString("hex"); registry[name].tokenHash = sha(token).toString("hex"); out.token = token; }
        if (body.rotateSecret) { registry[name].webhookSecret = randomBytes(32).toString("hex"); out.webhookSecret = registry[name].webhookSecret; }
        await saveRegistry();
        return json(res, 200, out);
      }
      return json(res, 405, { error: "method" });
    }

    // Operação da sessão: admin/LocaKar com API_KEY; demais sistemas com o token da própria instância.
    const m = url.pathname.match(/^\/sessions\/([^/]+)(\/(connect|send|known-phones))?$/);
    if (!m) return json(res, 404, { error: "not found" });
    const name = m[1];
    if (!config(name)) return json(res, 404, { error: "not found" });
    if (!canUse(name, key)) return json(res, 401, { error: "unauthorized" });
    if (req.method === "GET" && !m[2]) return json(res, 200, status(name));
    if (req.method === "POST" && m[3] === "connect") {
      const body = await readBody(req);
      const phone = body.phone ? String(body.phone).replace(/\D/g, "") : undefined;
      if (phone && !/^\d{12,13}$/.test(phone)) throw fail(400, "Telefone inválido (55 + DDD + número).");
      await start(name, phone);
      await new Promise((r) => setTimeout(r, 2500));
      return json(res, 200, status(name));
    }
    if (req.method === "POST" && m[3] === "send") return json(res, 200, await send(name, await readBody(req)));
    if (req.method === "POST" && m[3] === "known-phones") {
      const body = await readBody(req);
      const list = Array.isArray(body.phones) ? body.phones.map((p) => String(p).replace(/\D/g, "")) : [];
      if (list.length > 50 || list.some((p) => !/^\d{12,13}$/.test(p))) throw fail(400, "Envie até 50 números no formato 55 + DDD + número.");
      knownPhones.set(name, [...new Set(list)]);
      sessions.get(name)?.lidToPn?.clear();
      return json(res, 200, { ok: true, count: knownPhones.get(name).length });
    }
    if (req.method === "DELETE" && !m[2]) { await stop(name); return json(res, 200, { ok: true }); }
    return json(res, 405, { error: "method" });
  } catch (e) {
    json(res, e.status || 500, { error: e.status ? e.message : "erro interno" });
  }
});

// Reabre as sessões já pareadas ao subir o container.
await mkdir(DATA, { recursive: true });
await loadRegistry();
for (const k of await readdir(DATA)) if (!k.startsWith(".") && config(k)) start(k).catch(() => {});
server.listen(PORT, "0.0.0.0", () => console.log(`whaileys-api na porta ${PORT}`));
