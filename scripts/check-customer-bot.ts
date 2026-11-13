// Autoatendimento do locatário: roteador (cliente × gestor × dono-com-cliente), identificação, PIN,
// pagamentos só com métodos habilitados, comprovante, link do App em todo fim de fluxo, botões sem IA.
import assert from "node:assert/strict";
import { render } from "../src/lib/copilot/flow";
import { routeMessage } from "../src/lib/copilot/guard";
import { parseMessage } from "../src/lib/copilot/parse";
import { chargeButtons, handleCustomer, parseDate, type CustomerConfig, type CustomerPorts, type CustomerSession, type OpenInstallment, type RentalView } from "../src/lib/customer-bot/flow";
import { PHOTO_SLOTS } from "../src/lib/tenant";
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
const cfg = (m: Partial<CustomerConfig["methods"]> = {}): CustomerConfig => ({ orgName: "Locadora Teste", appUrl: "https://app.exemplo/locatario?org=teste", today: "2026-11-13", methods: { asaasPix: true, asaasBoleto: false, infinitepay: true, pixManual: true, ...m } });
const inst: OpenInstallment = { rentalId: "r1", receiptId: "r1-r2", label: "Semana 2", dueDate: "2026-11-06", amount: 360, total: 378, daysLate: 7, plate: "ABC1D23" };
const rental: RentalView = {
  id: "r1", status: "active", startDate: "2026-10-01", endDate: "2026-12-31", kmStart: 1000,
  vehicle: { name: "Kwid Zen", plate: "ABC1D23", odometer: 45230 },
  maintenance: [{ date: "2026-10-20", description: "Troca de óleo", status: "done" }],
  fines: [{ infractionDate: "2026-10-15", description: "Velocidade", amount: 130.16, status: "pending", dueDate: "2026-12-01" }],
  contract: { processId: "p1", status: "awaiting_signature" },
};
function ports(clients = [maria], opts: { pin?: "verified" | "wrong" | "locked" } = {}) {
  const calls: string[] = [];
  const p: CustomerPorts = {
    rentals: async (id) => (id === "c1" ? [rental] : []),
    upload: async (c, bucket, m, folder) => { calls.push(`upload:${bucket}:${folder ?? ""}`); return folder ? `${folder}.jpg` : `${c}/whatsapp-x.${m.mimetype.includes("pdf") ? "pdf" : "jpg"}`; },
    incident: async (_c, r, cat, desc, photos, req) => { calls.push(`incident:${r}:${cat}:${desc.length}:${photos.length}:${/^[A-Za-z0-9_-]{8,64}$/.test(req)}`); return { id: "i1" }; },
    document: async (_c, kind, path) => { calls.push(`document:${kind}:${path}`); return { id: "d1" }; },
    contractLink: async (_c, pid) => { calls.push(`contract:${pid}`); return { url: "https://autentique/assinar" }; },
    fleet: async () => [{ id: "v1", name: "Onix LT", category: "Hatch", weeklyRate: 650 }],
    reservations: async () => [{ id: "res1", vehicleName: "Onix LT", startDate: "2026-12-01", endDate: "2026-12-10", status: "pending" }],
    reserve: async (_c, v, s, e) => { calls.push(`reserve:${v}:${s}:${e}`); return { vehicleName: "Onix LT" }; },
    cancelReservation: async (_c, id) => { calls.push(`cancel:${id}`); },
    lead: async (name, v, s, e) => { calls.push(`lead:${name}:${v}:${s}:${e}`); },
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
    assert.deepEqual(calls, ["pin:false", "pin:true", "contract:p1"], "PIN certo retoma a ação pedida (contrato)");
    assert.ok(ok.replies.some((r) => r.text.includes("https://autentique/assinar")) && appInLast(ok.replies));
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
  // ---------- Etapa 2/3/4 ----------
  const v = fresh({ clientId: "c1", verified: true });
  const go = async (s: CustomerSession, ev: Parameters<typeof handleCustomer>[0], pp: CustomerPorts, media?: { mimetype: string; data: string }) => handleCustomer(ev, s, cfg(), pp, media);
  const img = { mimetype: "image/jpeg", data: "eA==" };

  // Datas digitadas.
  assert.equal(parseDate("25/12", "2026-11-13"), "2026-12-25");
  assert.equal(parseDate("05/01", "2026-11-13"), "2027-01-05", "dia/mês já passado → próximo ano");
  assert.equal(parseDate("31/02/2027", "2026-11-13"), null);
  assert.equal(parseDate("2026-12-01", "2026-11-13"), "2026-12-01");
  assert.equal(parseDate("amanhã", "2026-11-13"), null);

  // Minha locação: veículo, KM, parcelas, manutenção (sem custo) e multas; exige PIN.
  {
    const { p } = ports();
    const noPin = await go(fresh({ clientId: "c1" }), { kind: "action", id: "c:rental" }, p);
    assert.equal(noPin.session.step, "pin");
    const r = await go(v, { kind: "action", id: "c:rental" }, p);
    const t = r.replies[0].text;
    assert.ok(t.includes("Kwid Zen") && t.includes("45.230") && t.includes("Troca de óleo") && /Multas em aberto/.test(t) && /378,00/.test(t), t);
    assert.ok(appInLast(r.replies));
  }
  // Ocorrência: categoria → descrição curta recusada → descrição → 2 fotos → registrar.
  {
    const { p, calls } = ports();
    let s = (await go(v, { kind: "action", id: "c:incident" }, p)).session;
    assert.equal(s.step, "inc_cat", "uma locação só: pula a escolha");
    s = (await go(s, { kind: "action", id: "inc_c:pneu" }, p)).session;
    const short = await go(s, { kind: "text", text: "furou" }, p);
    assert.equal(short.session.step, "inc_desc");
    s = (await go(short.session, { kind: "text", text: "pneu dianteiro furou na Av. Brasil" }, p)).session;
    assert.equal(s.step, "inc_photos");
    s = (await go(s, { kind: "image" }, p, img)).session;
    s = (await go(s, { kind: "image" }, p, img)).session;
    assert.equal((s.data.photos as string[]).length, 2);
    const done = await go(s, { kind: "action", id: "inc_ok" }, p);
    assert.match(done.replies[0].text, /Ocorrência registrada[^]*2 foto/);
    assert.ok(appInLast(done.replies));
    assert.ok(calls.includes("incident:r1:pneu:34:2:true"), calls.join());
    // Botão antigo sem estar na etapa não registra nada.
    const stale = await go(v, { kind: "action", id: "inc_ok" }, p);
    assert.ok(!stale.replies[0].text.includes("registrada"));
  }
  // Documento: tipo → arquivo → em análise.
  {
    const { p, calls } = ports();
    let s = (await go(v, { kind: "action", id: "c:docs" }, p)).session;
    s = (await go(s, { kind: "action", id: "doc_k:cnh_front" }, p)).session;
    assert.equal(s.step, "doc_file");
    const r = await go(s, { kind: "document", mimetype: "application/pdf" }, p, { mimetype: "application/pdf", data: "eA==" });
    assert.match(r.replies[0].text, /CNH \(frente\)[^]*recebido/);
    assert.ok(calls.includes("document:cnh_front:c1/whatsapp-x.pdf"));
    const forged = await go(s, { kind: "action", id: "doc_k:selfie" }, p);
    assert.equal(forged.session.step, "doc_kind", "tipo fora da lista volta para a escolha");
  }
  // Reserva: frota → datas → pedido; cancelar a própria.
  {
    const { p, calls } = ports();
    const menu = await go(v, { kind: "action", id: "c:reserve" }, p);
    assert.deepEqual(render(menu.replies[0]).options.map((o) => o.id), ["res_new", "res_x:res1"]);
    let s = (await go(menu.session, { kind: "action", id: "res_new" }, p)).session;
    s = (await go(s, { kind: "action", id: "res_v:v1" }, p)).session;
    const past = await go(s, { kind: "text", text: "2026-11-01" }, p);
    assert.equal(past.session.step, "res_start", "retirada no passado recusada");
    s = (await go(s, { kind: "text", text: "01/12" }, p)).session;
    const before = await go(s, { kind: "text", text: "30/11/2026" }, p);
    assert.equal(before.session.step, "res_end", "devolução antes da retirada recusada");
    const ok = await go(s, { kind: "text", text: "10/12" }, p);
    assert.match(ok.replies[0].text, /Pedido de reserva enviado/);
    assert.ok(calls.includes("reserve:v1:2026-12-01:2026-12-10"));
    await go(v, { kind: "action", id: "res_x:res1" }, p);
    assert.ok(calls.includes("cancel:res1"));
  }
  // Visitante: frota → carro → datas → nome → lead; sem dados de cliente.
  {
    const { p, calls } = ports([]);
    const fleet = await go(fresh(), { kind: "action", id: "v:rent" }, p);
    assert.deepEqual(render(fleet.replies[0]).options.map((o) => o.id), ["lead_v:v1"]);
    assert.ok(!fleet.replies[0].text.includes("ABC"), "frota sem placa");
    let s = (await go(fleet.session, { kind: "action", id: "lead_v:v1" }, p)).session;
    s = (await go(s, { kind: "text", text: "20/11" }, p)).session;
    s = (await go(s, { kind: "text", text: "27/11" }, p)).session;
    assert.equal(s.step, "lead_name");
    const bad = await go(s, { kind: "text", text: "11999998888" }, p);
    assert.equal(bad.session.step, "lead_name", "número no lugar do nome recusado");
    const r = await go(s, { kind: "text", text: "Carlos Lima" }, p);
    assert.match(r.replies[0].text, /Obrigado, Carlos/);
    assert.ok(appInLast(r.replies));
    assert.ok(calls.includes("lead:Carlos Lima:v1:2026-11-20:2026-11-27"), calls.join());
    // "Ainda não sei" pula as datas.
    const skip = await go((await go(fresh(), { kind: "action", id: "lead_v:v1" }, p)).session, { kind: "action", id: "lead_d:skip" }, p);
    assert.equal(skip.session.step, "lead_name");
    assert.equal(skip.session.data.vehicleId, "v1", "pular datas mantém o carro escolhido");
    // Visitante não acessa ações de cliente nem com id forjado.
    const forged = await go(fresh(), { kind: "action", id: "res_x:res1" }, p);
    assert.match(forged.replies[0].text, /Bem-vindo/);
  }
  // Vistoria guiada: 9 fotos na pasta do App (mesmo requestId) e link direto da vistoria no App.
  {
    const { p, calls } = ports();
    let s = (await go(v, { kind: "action", id: "c:inspection" }, p)).session;
    assert.equal(s.step, "insp_kind");
    let r = await go(s, { kind: "action", id: "insp_k:return" }, p);
    s = r.session;
    const req = String(s.data.requestId);
    assert.match(req, /^wa-return-[a-z0-9]+$/, "pasta reconhecida pelo App");
    for (let i = 0; i < PHOTO_SLOTS.length; i++) {
      assert.match(r.replies.at(-1)!.text, new RegExp(`Foto ${i + 1} de ${PHOTO_SLOTS.length}`));
      r = await go(s, { kind: "image" }, p, img);
      s = r.session;
    }
    assert.match(r.replies[0].text, /Todas as 9 fotos/);
    assert.ok(r.replies[0].text.includes("https://app.exemplo/locatario/vistoria?org=teste&kind=return"), r.replies[0].text);
    assert.equal(calls.filter((c) => c.startsWith("upload:vistorias:")).length, 9);
    assert.ok(calls.includes(`upload:vistorias:r1/app/${req}/front_0`) && calls.includes(`upload:vistorias:r1/app/${req}/fuel_8`));
  }
  // Etapa 4: botões da cobrança (ids m:<método>:<ref>) caem direto no pagamento, sem menu nem PIN.
  {
    const { p, calls } = ports();
    const r = await go(fresh({ clientId: "c1" }), { kind: "action", id: "m:ip:r1|r1-r2" }, p);
    assert.match(r.replies[0].text, /checkout\/ip/);
    const off = await handleCustomer({ kind: "action", id: "m:ip:r1|r1-r2" }, fresh({ clientId: "c1" }), cfg({ infinitepay: false }), p);
    assert.match(off.replies[0].text, /Como deseja pagar/, "método desligado depois do envio: oferece os ativos");
    assert.deepEqual(calls, ["ip"]);
    const btn = (m: Partial<CustomerConfig["methods"]>) => chargeButtons("r1|r1-r2", cfg(m).methods).map((b) => b.id);
    assert.deepEqual(btn({}), ["m:asaas_pix:r1|r1-r2", "m:ip:r1|r1-r2", "app"]);
    assert.deepEqual(btn({ asaasPix: false }), ["m:pixm:r1|r1-r2", "m:ip:r1|r1-r2", "app"], "sem Asaas: Pix manual");
    assert.deepEqual(btn({ asaasPix: false, pixManual: false, infinitepay: false }), ["app"]);
    // Número digitado após a cobrança (opções gravadas na sessão).
    assert.deepEqual(parseMessage({ conversation: "2" }, ["m:asaas_pix:r1|r1-r2", "m:ip:r1|r1-r2", "app"]), { kind: "action", id: "m:ip:r1|r1-r2" });
  }
  console.log("✓ customer-bot ok");
})().catch((e) => { console.error(e); process.exit(1); });
