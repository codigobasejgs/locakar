// Caixa de conversas do WhatsApp: etiquetas, modos por plano, resposta automática, texto/telefone das mensagens, junção de históricos.
import assert from "node:assert/strict";
import { allowedModes, autoReplyFor, cleanLabels, defaultMode, isDirectJid, isoAt, mergeChats, mergeMessages, phoneOf, textOf, type Chat } from "../src/lib/whatsapp/inbox";

// Etiquetas
assert.deepEqual(cleanLabels(["Lead", " lead ", "", "Em   negociação"]), ["Lead", "Em negociação"], "sem vazias/repetidas, espaços normalizados");
assert.equal(cleanLabels(Array.from({ length: 11 }, (_, i) => `L${i}`)), null, "até 10");
assert.equal(cleanLabels("Lead"), null);
assert.equal(cleanLabels([1]), null);
assert.equal(cleanLabels(["x".repeat(50)])![0].length, 30);

// Modos por plano
assert.deepEqual(allowedModes({ buttons: false, ai: false }), ["human"], "Essencial: só humano");
assert.deepEqual(allowedModes({ buttons: true, ai: false }), ["human", "buttons"]);
assert.deepEqual(allowedModes({ buttons: false, ai: true }), ["human"], "IA exige WhatsApp por botões");
assert.deepEqual(allowedModes({ buttons: true, ai: true }), ["human", "buttons", "ai"]);
assert.equal(defaultMode("whaileys"), "buttons", "Whaileys mantém o autoatendimento de sempre");
assert.equal(defaultMode("evolution"), "human", "Evolution nunca respondia sozinha");

// Resposta automática: humano pausa; própria mensagem nunca; modo fora do plano não responde
const full = { buttons: true, ai: true };
assert.equal(autoReplyFor("human", { ...full, fromMe: false }), "none");
assert.equal(autoReplyFor("buttons", { ...full, fromMe: true }), "none");
assert.equal(autoReplyFor("ai", { buttons: true, ai: false, fromMe: false }), "none", "plano rebaixado desliga a IA");
assert.equal(autoReplyFor("ai", { ...full, fromMe: false }), "ai");
assert.equal(autoReplyFor("buttons", { ...full, fromMe: false }), "buttons");

// Conversa individual
assert.ok(isDirectJid("5511999990000@s.whatsapp.net") && isDirectJid("123456789012345@lid"));
assert.ok(!isDirectJid("120363000000@g.us") && !isDirectJid("status@broadcast") && !isDirectJid("abc@s.whatsapp.net"));

// Texto exibível
assert.equal(textOf({ conversation: " oi " }), "oi");
assert.equal(textOf({ ephemeralMessage: { message: { extendedTextMessage: { text: "olá" } } } }), "olá");
assert.equal(textOf({ imageMessage: { caption: "comprovante" } }), "📷 Foto: comprovante");
assert.equal(textOf({ audioMessage: {} }), "🎤 Áudio");
assert.equal(textOf({ buttonsResponseMessage: { selectedDisplayText: "💰 Pagar" } }), "💰 Pagar");
assert.equal(textOf({ protocolMessage: {} }), "", "evento sem conteúdo não vira mensagem");
assert.equal(textOf(null), "");

// Telefone real (LID com senderPn)
assert.equal(phoneOf({ remoteJid: "5511999990000@s.whatsapp.net" }), "5511999990000");
assert.equal(phoneOf({ remoteJid: "999@lid", senderPn: "5511988887777@s.whatsapp.net" }), "5511988887777");
assert.equal(phoneOf({ remoteJid: "999@lid" }), null);

// Datas
assert.equal(isoAt(1764255600), "2025-11-27T15:00:00.000Z", "segundos");
assert.equal(isoAt(1764255600000), "2025-11-27T15:00:00.000Z", "milissegundos");
assert.equal(isoAt("x", 5000), new Date(5000).toISOString(), "inválido vira agora");

// Junção: gravado (modo/etiquetas) prevalece sobre a leitura ao vivo; mais recente primeiro
const c = (id: string, at: string, extra: Partial<Chat> = {}): Chat => ({ id, name: "", phone: null, lastMessage: id, lastAt: at, mode: "human", labels: [], ...extra });
const merged = mergeChats([c("a", "2026-11-27T10:00:00Z", { name: "Ana" }), c("b", "2026-11-27T12:00:00Z")], [c("a", "2026-11-27T11:00:00Z", { mode: "ai", labels: ["Lead"], lastMessage: "nova" }), c("z", "2026-11-26T00:00:00Z")]);
assert.deepEqual(merged.map((x) => x.id), ["b", "a", "z"]);
assert.deepEqual([merged[1].mode, merged[1].labels, merged[1].lastMessage, merged[1].name], ["ai", ["Lead"], "nova", "Ana"]);
const msgs = mergeMessages([{ id: "1", text: "a", fromMe: false, at: "2026-11-27T10:00:00Z" }], [{ id: "1", text: "a", fromMe: false, at: "2026-11-27T10:00:00Z" }, { id: "0", text: "z", fromMe: true, at: "2026-11-27T09:00:00Z" }]);
assert.deepEqual(msgs.map((m) => m.id), ["0", "1"], "sem duplicar, ordem cronológica");

console.log("✓ whatsapp-inbox ok");
