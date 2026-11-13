// Motor Whaileys do Copiloto LocaKar: sessões WhatsApp por locadora, envio de botões/listas e
// repasse assinado (HMAC) das mensagens recebidas. Paralelo à Evolution API, sem tocar nela.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
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
if (!API_KEY || API_KEY.length < 24 || !WEBHOOK_URL || !WEBHOOK_SECRET || WEBHOOK_SECRET.length < 32) {
  console.error("Configure API_KEY (>=24), WEBHOOK_URL e WEBHOOK_SECRET (>=32).");
  process.exit(1);
}

const KEY = /^locakar_copilot_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MEDIA = { audioMessage: 8, imageMessage: 8, documentMessage: 8 }; // MB
const DOC_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const logger = pino({ level: "silent" });
const sessions = new Map(); // key -> { sock, state, qr, me }
// ponytail: anti-loop em memória (10 min); reinício perde o cache, mas o LocaKar também deduplica pelo id no banco.
const sent = new Map();
const remember = (id) => { sent.set(id, Date.now() + 600_000); for (const [k, t] of sent) if (t < Date.now()) sent.delete(k); };

const safeEq = (a, b) => { const x = createHash("sha256").update(a).digest(), y = createHash("sha256").update(b).digest(); return timingSafeEqual(x, y); };
const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

async function post(body) {
  const raw = JSON.stringify(body), ts = String(Date.now());
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${raw}`).digest("hex");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "x-whaileys-timestamp": ts, "x-whaileys-signature": sig }, body: raw, signal: AbortSignal.timeout(15_000) });
      if (r.status < 500) return;
    } catch { /* tenta de novo */ }
    await new Promise((s) => setTimeout(s, 1000 * 2 ** attempt));
  }
}

async function forward(key, s, msg) {
  const jid = msg.key?.remoteJid || "";
  if (!msg.message || !msg.key?.id || sent.has(msg.key.id)) return;
  if (/@(g\.us|broadcast|newsletter)$/.test(jid) || jid === "status@broadcast") return;
  const inner = msg.message.ephemeralMessage?.message || msg.message.viewOnceMessage?.message || msg.message.viewOnceMessageV2?.message || msg.message;
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
      } catch { /* sem mídia: o LocaKar responde que não conseguiu ler */ }
    }
  }
  await post({ instanceKey: key, me: s.me, key: msg.key, message: inner, pushName: msg.pushName ?? null, media });
}

async function start(key, phone) {
  const existing = sessions.get(key);
  if (existing?.sock && existing.state !== "closed") return existing;
  const dir = join(DATA, key);
  await mkdir(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const sock = makeWASocket({ auth: state, logger, browser: Browsers.ubuntu("LocaKar Copiloto"), markOnlineOnConnect: false, syncFullHistory: false, printQRInTerminal: false });
  const s = { sock, state: "connecting", qr: null, pairing: null, me: null };
  sessions.set(key, s);
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (u) => {
    if (u.qr) s.qr = await QRCode.toDataURL(u.qr).catch(() => null);
    if (u.connection === "open") { s.state = "open"; s.qr = null; s.pairing = null; s.me = { id: sock.user?.id ?? null, lid: sock.authState?.creds?.me?.lid ?? null }; }
    if (u.connection === "close") {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      s.state = "closed";
      if (code === DisconnectReason.loggedOut) { sessions.delete(key); await rm(dir, { recursive: true, force: true }); }
      else setTimeout(() => start(key).catch(() => {}), code === DisconnectReason.restartRequired ? 500 : 5000);
    }
  });
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const m of messages) forward(key, s, m).catch(() => {});
  });
  if (phone && !state.creds.registered) {
    await new Promise((r) => setTimeout(r, 1500));
    s.pairing = await sock.requestPairingCode(phone).catch(() => null);
  }
  return s;
}

const status = (key) => {
  const s = sessions.get(key);
  return { state: s?.state ?? "disconnected", qr: s?.qr ?? null, pairingCode: s?.pairing ?? null, me: s?.me ?? null };
};

async function send(key, body) {
  const s = sessions.get(key);
  if (s?.state !== "open") throw Object.assign(new Error("Sessão desconectada."), { status: 409 });
  const to = String(body.to || "");
  if (!/^\d{10,15}@s\.whatsapp\.net$|^\d{5,20}@lid$/.test(to)) throw Object.assign(new Error("Destino inválido."), { status: 400 });
  const text = String(body.text || "").slice(0, 4000);
  let content = { text };
  if (Array.isArray(body.sections) && body.sections.length) {
    content = { text, buttonText: String(body.buttonText || "Abrir opções").slice(0, 20), title: String(body.title || "").slice(0, 60), footer: body.footer ? String(body.footer).slice(0, 60) : undefined,
      sections: body.sections.slice(0, 10).map((sec) => ({ title: String(sec.title || "").slice(0, 24), rows: (sec.rows || []).slice(0, 10).map((r) => ({ rowId: String(r.id).slice(0, 200), title: String(r.title).slice(0, 24), description: r.description ? String(r.description).slice(0, 72) : undefined })) })) };
  } else if (Array.isArray(body.buttons) && body.buttons.length) {
    content = { text, footer: body.footer ? String(body.footer).slice(0, 60) : undefined, buttons: body.buttons.slice(0, 3).map((b) => ({ buttonId: String(b.id).slice(0, 200), buttonText: { displayText: String(b.title).slice(0, 20) } })) };
  }
  let msg;
  try { msg = await s.sock.sendMessage(to, content); }
  catch { msg = await s.sock.sendMessage(to, { text }); } // fallback: o texto já traz as opções numeradas
  remember(msg.key.id);
  return { messageId: msg.key.id };
}

const server = createServer(async (req, res) => {
  try {
    if (req.url === "/health") return json(res, 200, { ok: true });
    if (!safeEq(String(req.headers["x-api-key"] || ""), API_KEY)) return json(res, 401, { error: "unauthorized" });
    const m = req.url.match(/^\/sessions\/([^/?]+)(\/(connect|send))?$/);
    if (!m || !KEY.test(m[1])) return json(res, 404, { error: "not found" });
    const key = m[1];
    let body = {};
    if (req.method === "POST") {
      let raw = "";
      for await (const c of req) { raw += c; if (raw.length > 64_000) return json(res, 413, { error: "payload" }); }
      body = raw ? JSON.parse(raw) : {};
    }
    if (req.method === "GET" && !m[2]) return json(res, 200, status(key));
    if (req.method === "POST" && m[3] === "connect") {
      const phone = body.phone ? String(body.phone).replace(/\D/g, "") : undefined;
      if (phone && !/^\d{12,13}$/.test(phone)) return json(res, 400, { error: "Telefone inválido." });
      await start(key, phone);
      await new Promise((r) => setTimeout(r, 2500));
      return json(res, 200, status(key));
    }
    if (req.method === "POST" && m[3] === "send") return json(res, 200, await send(key, body));
    if (req.method === "DELETE" && !m[2]) {
      const s = sessions.get(key);
      await s?.sock.logout().catch(() => {});
      sessions.delete(key);
      await rm(join(DATA, key), { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: "method" });
  } catch (e) {
    json(res, e.status || 500, { error: e.status ? e.message : "erro interno" });
  }
});

// Reabre as sessões já pareadas ao subir o container.
const { readdir } = await import("node:fs/promises");
await mkdir(DATA, { recursive: true });
for (const k of await readdir(DATA)) if (KEY.test(k)) start(k).catch(() => {});
server.listen(PORT, "0.0.0.0", () => console.log(`whaileys-api na porta ${PORT}`));
