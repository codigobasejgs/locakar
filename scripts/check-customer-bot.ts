// Autoatendimento do locatário: roteador (cliente × gestor × dono-com-cliente), identificação, PIN,
// pagamentos só com métodos habilitados, comprovante, link do App em todo fim de fluxo, botões sem IA.
import assert from "node:assert/strict";
import { render } from "../src/lib/copilot/flow";
import { routeMessage } from "../src/lib/copilot/guard";
import { parseMessage } from "../src/lib/copilot/parse";
import { handleCustomer, type CustomerConfig, type CustomerPorts, type CustomerSession, type OpenInstallment } from "../src/lib/customer-bot/flow";
import { firstName, matchClients, pickByCpf, pinMatches } from "../src/lib/customer-bot/identify";

// ---------- Roteador ----------
const me = { id: "5519988887777:12@s.whatsapp.net", lid: "123@lid" };
const admins = ["5511912345678"];
const R = (key: object, bot = true) => routeMessage(key, me, admins, bot);
assert.equal(R({ remoteJid: "5519988887777@s.whatsapp.net", fromMe: true }).to, "copilot", "self-chat → Copiloto");
assert.equal(R({ remoteJid: "5511912345678@s.whatsapp.net", fromMe: false }).to, "copilot", "gestor → Copiloto");
assert.deepEqual(R({ remoteJid: "5511900001111@s.whatsapp.net", fromMe: false }), { to: "customer", phone: "5511900001111", replyTo: "5511900001111@s.whatsapp.net" }, "cliente → autoatendimento");
assert.equal(R({ remoteJid: "5511900001111@s.whatsapp.net", fromMe: false }, false).to, "ignore", "autoatendimento desligado ignora cliente");
assert.equal(R({ remoteJid: "5511900001111@s.whatsapp.net", fromMe: true }).to, "ignore", "dono falando com cliente: nunca responde");
assert.equal(R({ remoteJid: "999@lid", fromMe: false }).to, "ignore", "só LID sem número: não atende (não dá para identificar)");
const lid = R({ remoteJid: "999@lid", fromMe: false, senderPn: "5511900001111@s.whatsapp.net" });
assert.deepEqual(lid, { to: "customer", phone: "5511900001111", replyTo: "999@lid" }, "LID com número real: responde no LID");
assert.equal(R({ remoteJid: "120@g.us", fromMe: false }).to, "ignore", "grupo ignorado");

// ---------- Identificação ----------
const maria = { id: "c1", name: "Maria Souza", phone: "(11) 90000-1111", cpf: "529.982.247-25" };
const joao = { id: "c2", name: "João", phone: "11 3333-4444", backupPhone: "(11) 90000-1111", cpf: "11144477735" };
assert.deepEqual(matchClients("5511900001111", [maria]).map((c) => c.id), ["c1"]);
assert.deepEqual(matchClients("551100001111", [maria]).map((c) => c.id), ["c1"], "sem o 9º dígito");
assert.deepEqual(matchClients("5511900001111", [maria, joao]).map((c) => c.id), ["c1", "c2"], "telefone reserva também casa → ambíguo");
assert.deepEqual(matchClients("5511977776666", [maria]), []);
assert.ok(pinMatches("5299", maria.cpf) && !pinMatches("5298", maria.cpf) && !pinMatches("52998", maria.cpf) && !pinMatches("5299", "123"));
assert.equal(pickByCpf("111.444.777-35", [maria, joao])?.id, "c2");
assert.equal(pickByCpf("1234", [maria, joao]), undefined);
assert.equal(firstName("Maria Souza Lima"), "Maria");

// ---------- Fluxo ----------
const cfg = (m: Partial<CustomerConfig["methods"]> = {}): CustomerConfig => ({ orgName: "Locadora Teste", appUrl: "https://app.exemplo/locatario?org=teste", methods: { asaasPix: true, asaasBoleto: false, infinitepay: true, pixManual: true, ...m } });
const inst: OpenInstallment = { rentalId: "r1", receiptId: "r1-r2", label: "Semana 2", dueDate: "2026-11-06", amount: 360, total: 378, daysLate: 7, plate: "ABC1D23" };
function ports(clients = [maria], opts: { pin?: "verified" | "wrong" | "locked" } = {}) {
  const calls: string[] = [];
  const p: CustomerPorts = {
    candidates: async () => clients,
    installments: async (id) => (id === "c1" ? [inst] : []),
    pin: async (_id, ok) => { calls.push(`pin:${ok}`); return opts.pin ?? (ok ? "verified" : "wrong"); },
    asaas: async (_c, _r, _rc, kind) => { calls.push(`asaas:${kind}`); return { pix: "00020126PIXCOPIAECOLA", invoiceUrl: "https://fatura" }; },
    infinitepay: async () => { calls.push("ip"); return { url: "https://checkout/ip" }; },
    pixManual: async () => { calls.push("pixm"); return { code: "000201MANUAL", key: "chave@pix", name: "LOCADORA", amount: 378 }; },
    proof: async (_c, r, rc, m) => { calls.push(`proof:${r}|${rc}:${m.mimetype}`); return { amount: 378 }; },
  };
  return { p, calls };
}
const fresh = (s: Partial<CustomerSession> = {}): CustomerSession => ({ step: "menu", data: {}, clientId: null, verified: false, locked: false, ...s });
const appInLast = (rs: { text: string; buttons?: { id: string }[] }[]) => {
  const last = rs.at(-1)!;
  return last.text.includes("https://app.exemplo/locatario?org=teste") && (last.buttons ?? []).some((b) => b.id === "app");
};

(async () => {
  // Visitante (número desconhecido): menu de visitante, nunca dados.
  {
    const { p } = ports([]);
    const r = await handleCustomer({ kind: "text", text: "oi" }, fresh(), cfg(), p);
    assert.match(r.replies[0].text, /Bem-vindo/);
    assert.deepEqual(render(r.replies[0]).options.map((o) => o.id), ["v:fleet", "v:rent", "app"]);
    const pay = await handleCustomer({ kind: "action", id: "c:pay" }, fresh(), cfg(), p);
    assert.match(pay.replies[0].text, /Bem-vindo/, "visitante não acessa ações de cliente");
  }
  // Cliente: saudação só com primeiro nome; menu completo.
  {
    const { p } = ports();
    const r = await handleCustomer({ kind: "text", text: "menu" }, fresh(), cfg(), p);
    assert.match(r.replies[0].text, /Olá, Maria!/);
    assert.ok(!r.replies[0].text.includes("Souza") && !r.replies[0].text.includes("529"), "sem nome completo nem CPF");
    assert.equal(r.session.clientId, "c1");
    assert.ok(render(r.replies[0]).options.some((o) => o.id === "c:pay"));
  }
  // Número ambíguo: pede CPF; CPF certo identifica.
  {
    const { p } = ports([maria, joao]);
    const r = await handleCustomer({ kind: "text", text: "oi" }, fresh(), cfg(), p);
    assert.equal(r.session.step, "disambiguate");
    const r2 = await handleCustomer({ kind: "text", text: "11144477735" }, r.session, cfg(), p);
    assert.equal(r2.session.clientId, "c2");
  }
  // Pagar sem PIN: lista parcelas, mostra só métodos habilitados, valor do servidor.
  {
    const { p, calls } = ports();
    const s = fresh({ clientId: "c1" });
    const list = await handleCustomer({ kind: "action", id: "c:pay" }, s, cfg(), p);
    assert.match(list.replies[0].text, /R\$\s?378,00/);
    assert.deepEqual(render(list.replies[0]).options.map((o) => o.id), ["pay:r1|r1-r2"]);
    const methods = await handleCustomer({ kind: "action", id: "pay:r1|r1-r2" }, list.session, cfg({ asaasBoleto: false }), p);
    assert.deepEqual(render(methods.replies[0]).options.map((o) => o.id), ["m:asaas_pix:r1|r1-r2", "m:ip:r1|r1-r2", "m:pixm:r1|r1-r2"], "só métodos habilitados");
    const none = await handleCustomer({ kind: "action", id: "pay:r1|r1-r2" }, s, cfg({ asaasPix: false, infinitepay: false, pixManual: false }), p);
    assert.match(none.replies[0].text, /indisponível/);
    const pix = await handleCustomer({ kind: "action", id: "m:asaas_pix:r1|r1-r2" }, s, cfg(), p);
    assert.ok(pix.replies.some((x) => x.text === "00020126PIXCOPIAECOLA"), "copia e cola em mensagem própria (fácil de copiar)");
    assert.ok(appInLast(pix.replies), "fim do fluxo convida ao App");
    const ip = await handleCustomer({ kind: "action", id: "m:ip:r1|r1-r2" }, s, cfg(), p);
    assert.match(ip.replies[0].text, /https:\/\/checkout\/ip/);
    assert.ok(appInLast(ip.replies));
    assert.deepEqual(calls, ["asaas:PIX", "ip"]);
    // Parcela de outro cliente/forjada não é encontrada.
    const forged = await handleCustomer({ kind: "action", id: "m:ip:rX|rX-1" }, s, cfg(), p);
    assert.match(forged.replies[0].text, /não está mais em aberto/);
  }
  // Pix manual + comprovante enviado no chat.
  {
    const { p, calls } = ports();
    const s = fresh({ clientId: "c1" });
    const r = await handleCustomer({ kind: "action", id: "m:pixm:r1|r1-r2" }, s, cfg(), p);
    assert.equal(r.session.step, "proof");
    assert.ok(r.replies.some((x) => x.text === "000201MANUAL"));
    const wrong = await handleCustomer({ kind: "text", text: "paguei" }, r.session, cfg(), p);
    assert.equal(wrong.session.step, "menu", "texto sai do passo (menu)");
    const proof = await handleCustomer({ kind: "image", mimetype: "image/jpeg" }, r.session, cfg(), p, { mimetype: "image/jpeg", data: "eA==" });
    assert.match(proof.replies[0].text, /Comprovante recebido/);
    assert.ok(appInLast(proof.replies));
    assert.ok(calls.includes("proof:r1|r1-r2:image/jpeg"));
    const noMedia = await handleCustomer({ kind: "image" }, r.session, cfg(), p);
    assert.match(noMedia.replies[0].text, /Não consegui ler/);
  }
  // Ação sensível exige PIN; PIN certo libera por 24h; errado repete; bloqueado avisa.
  {
    const { p, calls } = ports();
    const s = fresh({ clientId: "c1" });
    const ask = await handleCustomer({ kind: "action", id: "c:contract" }, s, cfg(), p);
    assert.match(ask.replies[0].text, /4 primeiros dígitos/);
    assert.equal(ask.session.step, "pin");
    const bad = await handleCustomer(parseMessage({ conversation: "1234" }), ask.session, cfg(), p);
    assert.match(bad.replies[0].text, /Não confere/);
    assert.equal(bad.session.step, "pin");
    const ok = await handleCustomer(parseMessage({ conversation: "5299" }), bad.session, cfg(), p);
    assert.equal(ok.session.verified, true);
    assert.match(ok.replies[0].text, /confirmada por 24 horas/);
    assert.deepEqual(calls, ["pin:false", "pin:true"]);
    const locked = await handleCustomer({ kind: "action", id: "c:contract" }, fresh({ clientId: "c1", locked: true }), cfg(), p);
    assert.match(locked.replies[0].text, /30 minutos/);
    const lockedPin = await handleCustomer(parseMessage({ conversation: "5299" }), ask.session, cfg(), ports([maria], { pin: "locked" }).p);
    assert.match(lockedPin.replies[0].text, /30 minutos/);
    // Pagar não pede PIN.
    const pay = await handleCustomer({ kind: "action", id: "c:pay" }, s, cfg(), p);
    assert.doesNotMatch(pay.replies[0].text, /dígitos/);
  }
  // Número digitado funciona como botão (aparelhos sem botões).
  {
    const { p } = ports();
    const menu = await handleCustomer({ kind: "text", text: "menu" }, fresh(), cfg(), p);
    const ev = parseMessage({ conversation: "1" }, menu.session.data.opts as string[]);
    assert.deepEqual(ev, { kind: "action", id: "c:pay" });
  }
  // Erro de integração vira mensagem amigável + App (nunca trava a conversa).
  {
    const { p } = ports();
    p.asaas = async () => { throw new Error("Pagamento online indisponível no momento."); };
    const r = await handleCustomer({ kind: "action", id: "m:asaas_pix:r1|r1-r2" }, fresh({ clientId: "c1" }), cfg(), p);
    assert.match(r.replies[0].text, /indisponível/);
    assert.ok(appInLast(r.replies));
    assert.equal(r.session.step, "menu");
  }
  console.log("✓ customer-bot ok");
})().catch((e) => { console.error(e); process.exit(1); });
