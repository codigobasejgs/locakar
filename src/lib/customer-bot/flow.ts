/**
 * Autoatendimento do locatário no WhatsApp: máquina de estados determinística (sem IA).
 * Puro: dados e efeitos chegam por `ports` (webhook, simulador e testes usam o mesmo fluxo).
 * Regras: valor sempre do servidor; dados sensíveis só após os 4 primeiros dígitos do CPF;
 * todo fim de fluxo traz o link do App Oficial.
 */
import { formatCurrency, formatDate } from "../utils";
import type { Opt, Reply } from "../copilot/flow";
import { isMenuCommand, type CopilotEvent } from "../copilot/parse";
import { firstName, pinMatches, pickByCpf, type ClientRef } from "./identify";

export type { Opt, Reply };
export interface CustomerSession { step: string; data: Record<string, unknown>; clientId: string | null; verified: boolean; locked: boolean }
export interface CustomerConfig { orgName: string; appUrl: string; methods: { asaasPix: boolean; asaasBoleto: boolean; infinitepay: boolean; pixManual: boolean } }
export interface OpenInstallment { rentalId: string; receiptId: string; label: string; dueDate: string; amount: number; total: number; daysLate: number; plate?: string }
export type PinResult = "verified" | "wrong" | "locked";

export interface CustomerPorts {
  /** Clientes da locadora com este telefone (0 = visitante; >1 = ambíguo). */
  candidates(): Promise<ClientRef[]>;
  /** Parcelas em aberto do cliente identificado (valor atualizado calculado no servidor). */
  installments(clientId: string): Promise<OpenInstallment[]>;
  /** Registra tentativa do PIN (bloqueio após 5 erros fica no banco). */
  pin(clientId: string, ok: boolean): Promise<PinResult>;
  asaas(clientId: string, rentalId: string, receiptId: string, kind: "PIX" | "BOLETO"): Promise<{ pix?: string | null; invoiceUrl?: string | null; line?: string | null }>;
  infinitepay(clientId: string, rentalId: string, receiptId: string): Promise<{ url: string }>;
  pixManual(clientId: string, rentalId: string, receiptId: string): Promise<{ code: string | null; key: string; name: string; amount: number }>;
  proof(clientId: string, rentalId: string, receiptId: string, media: { mimetype: string; data: string }): Promise<{ amount: number }>;
}

const APP_ID = "app";
const MENU: Opt = { id: "menu", title: "🏠 Menu" };
const appBtn = (): Opt => ({ id: APP_ID, title: "📱 Abrir App Oficial" });
const MAX_ROWS = 10;

/** Toda conclusão termina com o convite ao App Oficial (botão + link no texto). */
function done(cfg: CustomerConfig, text: string, extra: Opt[] = []): Reply {
  return { text: `${text}\n\n📱 *App Oficial da ${cfg.orgName}:* ${cfg.appUrl}\nAcompanhe tudo, pague e envie documentos pelo app.`, buttons: [...extra, appBtn(), MENU].slice(0, 3) };
}

export async function handleCustomer(
  ev: CopilotEvent,
  session: CustomerSession,
  cfg: CustomerConfig,
  ports: CustomerPorts,
  media?: { mimetype: string; data: string },
): Promise<{ replies: Reply[]; session: CustomerSession }> {
  const replies: Reply[] = [];
  const say = (r: Reply): void => { replies.push(r); };
  let next: CustomerSession = { ...session, step: "menu", data: {} };
  const keep = (step: string, data: Record<string, unknown> = {}) => { next = { ...next, step, data }; };

  // Identifica (ou mantém) o cliente. Ambíguo vira etapa de CPF.
  let client: ClientRef | undefined;
  if (session.clientId) client = (await ports.candidates()).find((c) => c.id === session.clientId);
  if (!client && !session.clientId) {
    const list = await ports.candidates();
    if (list.length === 1) { client = list[0]; next.clientId = client.id; }
    else if (list.length > 1 && session.step !== "disambiguate") {
      keep("disambiguate");
      return { replies: [{ text: `Olá! Encontramos mais de um cadastro com este número na ${cfg.orgName}.\nDigite o seu *CPF completo* (só números) para continuar.` }], session: next };
    }
  }
  const clientId = client?.id ?? null;

  const visitorMenu = () => say({
    text: `Olá! 👋 Bem-vindo(a) à *${cfg.orgName}*.\nComo podemos ajudar?`,
    list: { button: "Ver opções", rows: [
      { id: "v:fleet", title: "🚗 Carros disponíveis", description: "Veja a frota para alugar" },
      { id: "v:rent", title: "📅 Quero alugar", description: "Cadastro pelo App Oficial" },
      { id: APP_ID, title: "📱 Baixar o App", description: "Canal oficial do cliente" },
    ] },
  });

  const clientMenu = () => say({
    text: `Olá, ${firstName(client?.name)}! 👋\nAtendimento automático da *${cfg.orgName}*. Escolha uma opção:`,
    list: { button: "Ver opções", rows: [
      { id: "c:pay", title: "💰 Pagar / 2ª via", description: "Pix, boleto ou cartão" },
      { id: "c:rental", title: "🚗 Minha locação", description: "Veículo, parcelas e multas" },
      { id: "c:incident", title: "🛠️ Abrir ocorrência", description: "Pneu, acidente, problema" },
      { id: "c:docs", title: "📄 Enviar documentos", description: "CNH e comprovante" },
      { id: "c:inspection", title: "📸 Vistoria", description: "Fotos do veículo" },
      { id: "c:reserve", title: "📅 Reserva", description: "Pedir ou cancelar" },
      { id: "c:contract", title: "✍️ Contrato", description: "Assinar ou baixar" },
      { id: APP_ID, title: "📱 App Oficial", description: "Tudo em um só lugar" },
    ] },
  });

  const menu = () => (clientId ? clientMenu() : visitorMenu());

  // Ações que expõem dados pessoais/contratuais exigem os 4 primeiros dígitos do CPF.
  const requireVerified = (resume: string): boolean => {
    if (session.verified) return true;
    if (session.locked) { say(done(cfg, "🔒 Muitas tentativas incorretas. Por segurança, tente novamente em 30 minutos.")); return false; }
    keep("pin", { resume });
    say({ text: "🔐 Para sua segurança, digite os *4 primeiros dígitos do seu CPF*.", buttons: [MENU] });
    return false;
  };

  const installmentList = async () => {
    const list = await ports.installments(clientId!);
    if (!list.length) return say(done(cfg, "✅ Você não tem parcelas em aberto. Obrigado!"));
    const total = list.reduce((s, i) => s + i.total, 0);
    say({
      text: `💰 *Parcelas em aberto* (${list.length})\nTotal atualizado: ${formatCurrency(total)}${list.length > MAX_ROWS ? `\nMostrando as ${MAX_ROWS} mais antigas.` : ""}\n\nEscolha a parcela para pagar:`,
      list: { button: "Ver parcelas", rows: list.slice(0, MAX_ROWS).map((i) => ({ id: `pay:${i.rentalId}|${i.receiptId}`, title: `${i.label}${i.plate ? ` • ${i.plate}` : ""}`.slice(0, 24), description: `${formatCurrency(i.total)} · venc. ${formatDate(i.dueDate)}${i.daysLate ? ` · ${i.daysLate}d atraso` : ""}` })) },
    });
  };

  const findInstallment = async (ref: string) => {
    const [r, rc] = ref.split("|");
    return (await ports.installments(clientId!)).find((i) => i.rentalId === r && i.receiptId === rc);
  };

  const methodChoice = async (ref: string) => {
    const i = await findInstallment(ref);
    if (!i) return say(done(cfg, "Esta parcela não está mais em aberto."));
    const m = cfg.methods;
    const opts: Opt[] = [
      ...(m.asaasPix ? [{ id: `m:asaas_pix:${ref}`, title: "⚡ Pix", description: "Código copia e cola" }] : []),
      ...(m.asaasBoleto ? [{ id: `m:asaas_boleto:${ref}`, title: "🧾 Boleto", description: "Linha digitável" }] : []),
      ...(m.infinitepay ? [{ id: `m:ip:${ref}`, title: "💳 Cartão ou Pix", description: "Link InfinitePay (até 12x)" }] : []),
      ...(m.pixManual ? [{ id: `m:pixm:${ref}`, title: "📲 Pix + comprovante", description: "Envie o comprovante aqui" }] : []),
    ];
    if (!opts.length) return say(done(cfg, "No momento o pagamento online está indisponível. Fale com a locadora."));
    say({ text: `🧾 *${i.label}*${i.plate ? ` · ${i.plate}` : ""}\nVencimento: ${formatDate(i.dueDate)}${i.daysLate ? ` (${i.daysLate} dia(s) de atraso)` : ""}\nValor: ${formatCurrency(i.amount)}${i.total !== i.amount ? `\n*Total atualizado: ${formatCurrency(i.total)}* (multa/juros)` : ""}\n\nComo deseja pagar?`, list: { button: "Formas de pagamento", rows: opts } });
  };

  const pay = async (method: string, ref: string) => {
    const [rentalId, receiptId] = ref.split("|");
    const i = await findInstallment(ref);
    if (!i) return say(done(cfg, "Esta parcela não está mais em aberto."));
    if (method === "asaas_pix" || method === "asaas_boleto") {
      const r = await ports.asaas(clientId!, rentalId, receiptId, method === "asaas_pix" ? "PIX" : "BOLETO");
      if (method === "asaas_pix" && r.pix) {
        say({ text: `⚡ *Pix — ${formatCurrency(i.total)}*\nCopie o código abaixo e cole no app do seu banco (Pix copia e cola):` });
        say({ text: r.pix });
        return say(done(cfg, "✅ Assim que o pagamento cair, a baixa é automática e você recebe a confirmação."));
      }
      return say(done(cfg, `🧾 *Boleto — ${formatCurrency(i.total)}*${r.line ? `\nLinha digitável:\n${r.line}` : ""}${r.invoiceUrl ? `\n\nBoleto/fatura: ${r.invoiceUrl}` : ""}\n\nA baixa é automática após a compensação.`));
    }
    if (method === "ip") {
      const r = await ports.infinitepay(clientId!, rentalId, receiptId);
      return say(done(cfg, `💳 *Pagar ${formatCurrency(i.total)}*\nPix ou cartão em até 12x pela InfinitePay:\n${r.url}\n\nA confirmação é automática.`));
    }
    const r = await ports.pixManual(clientId!, rentalId, receiptId);
    keep("proof", { ref });
    say({ text: `📲 *Pix — ${formatCurrency(r.amount)}*\nRecebedor: ${r.name}\nChave: ${r.key}${r.code ? "\n\nOu use o Pix copia e cola abaixo:" : ""}` });
    if (r.code) say({ text: r.code });
    say({ text: "Depois de pagar, *envie aqui a foto ou o PDF do comprovante*. A equipe confere e dá baixa.", buttons: [MENU] });
  };

  const route = async (id: string): Promise<void> => {
    const i = id.indexOf(":");
    const [cmd, arg] = i < 0 ? [id, ""] : [id.slice(0, i), id.slice(i + 1)];
    if (cmd === "menu") return menu();
    if (cmd === APP_ID) return say(done(cfg, `Baixe e use o *App Oficial da ${cfg.orgName}*: lá você acompanha sua locação, paga, envia documentos e faz a vistoria.`));
    if (cmd === "v") {
      if (arg === "fleet" || arg === "rent") return say(done(cfg, "🚗 Para ver os carros disponíveis e fazer seu cadastro (documentos e selfie), use o App Oficial. Em breve também por aqui."));
      return visitorMenu();
    }
    if (!clientId) return visitorMenu();
    if (cmd === "c") {
      if (arg === "pay") return installmentList();
      if (!requireVerified(`c:${arg}`)) return;
      return say(done(cfg, "Este atendimento pelo WhatsApp chega em breve. Por enquanto, faça pelo App Oficial."));
    }
    if (cmd === "pay") return methodChoice(arg);
    if (cmd === "m") {
      const j = arg.indexOf(":");
      return pay(arg.slice(0, j), arg.slice(j + 1));
    }
    return menu();
  };

  try {
    if (session.step === "disambiguate" && ev.kind === "text" && !isMenuCommand(ev.text)) {
      const picked = pickByCpf(ev.text, await ports.candidates());
      if (!picked) { keep("disambiguate"); say({ text: "CPF não encontrado entre os cadastros deste número. Digite o CPF completo (11 números)." }); }
      else { client = picked; next.clientId = picked.id; clientMenu(); }
    } else if (session.step === "pin" && ev.kind === "text" && !isMenuCommand(ev.text) && clientId) {
      const r = await ports.pin(clientId, pinMatches(ev.text, client?.cpf));
      if (r === "verified") { next.verified = true; say({ text: "✅ Identidade confirmada por 24 horas." }); await route(String(session.data.resume ?? "menu")); }
      else if (r === "locked") say(done(cfg, "🔒 Muitas tentativas incorretas. Por segurança, tente novamente em 30 minutos."));
      else { keep("pin", session.data); say({ text: "❌ Não confere. Digite os *4 primeiros dígitos do seu CPF*.", buttons: [MENU] }); }
    } else if (session.step === "proof" && (ev.kind === "image" || ev.kind === "document") && clientId) {
      const [rentalId, receiptId] = String(session.data.ref ?? "").split("|");
      if (!media) say(done(cfg, "Não consegui ler o arquivo. Envie uma foto (JPG/PNG) ou PDF de até 7 MB."));
      else {
        const r = await ports.proof(clientId, rentalId, receiptId, media);
        say(done(cfg, `✅ Comprovante recebido (${formatCurrency(r.amount)}). A equipe vai conferir e você recebe a confirmação.`));
      }
    } else if (ev.kind === "action") await route(ev.id);
    else if (ev.kind === "text") menu();
    else if (session.step === "proof") { keep("proof", session.data); say({ text: "Envie a *foto ou o PDF* do comprovante.", buttons: [MENU] }); }
    else say(done(cfg, "Recebemos seu arquivo, mas ele precisa de uma opção do menu. Escolha abaixo."));
  } catch (e) {
    next = { ...next, step: "menu", data: {} };
    say(done(cfg, `⚠️ ${(e as Error).message || "Não foi possível concluir agora."}`));
  }

  const last = replies.at(-1);
  const opts = last ? (last.list?.rows ?? last.buttons ?? []).map((o) => o.id) : [];
  next = { ...next, data: { ...next.data, opts } };
  return { replies, session: next };
}
