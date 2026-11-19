/**
 * Autoatendimento do locatário no WhatsApp: máquina de estados determinística (sem IA).
 * Puro: dados e efeitos chegam por `ports` (webhook, simulador e testes usam o mesmo fluxo).
 * Regras: valor sempre do servidor; dados sensíveis só após os 4 primeiros dígitos do CPF;
 * todo fim de fluxo traz o link do App Oficial.
 */
import { addDays, formatCurrency, formatDate, formatNumber } from "../utils";
import type { Opt, Reply } from "../copilot/flow";
import { isMenuCommand, type CopilotEvent } from "../copilot/parse";
import { DOCUMENT_KIND, INCIDENT_CATEGORY, PHOTO_SLOTS, TENANT_INSPECTION_KIND } from "../tenant";
import { GATEWAYS, isGateway, type GatewayId } from "../gateways";
import { firstName, pinMatches, pickByCpf, type ClientRef } from "./identify";

export type { Opt, Reply };
export interface CustomerSession { step: string; data: Record<string, unknown>; clientId: string | null; verified: boolean; locked: boolean }
export interface CustomerConfig { orgName: string; appUrl: string; today: string; /** Plano com check-in periódico (ausente = liberado). */ periodicCheckin?: boolean; methods: { asaasPix: boolean; asaasBoleto: boolean; infinitepay: boolean; pixManual: boolean; gateways?: GatewayId[] } }
export interface OpenInstallment { rentalId: string; receiptId: string; label: string; dueDate: string; amount: number; total: number; daysLate: number; plate?: string }
export type PinResult = "verified" | "wrong" | "locked";
export type Media = { mimetype: string; data: string };
export interface RentalView {
  id: string; status: string; startDate: string; endDate: string; kmStart?: number | null;
  vehicle?: { name: string; plate: string; odometer?: number | null } | null;
  maintenance: { date: string; description: string; status: string }[];
  fines: { infractionDate: string; description: string; amount: number; status: string; dueDate: string }[];
  contract?: { processId: string; status: string } | null;
}
export interface FleetItem { id: string; name: string; category?: string | null; dailyRate?: number | null; weeklyRate?: number | null }
export interface ReservationView { id: string; vehicleName: string; startDate: string; endDate: string; status: string }

export interface CustomerPorts {
  /** Clientes da locadora com este telefone (0 = visitante; >1 = ambíguo). */
  candidates(): Promise<ClientRef[]>;
  /** Parcelas em aberto do cliente identificado (valor atualizado calculado no servidor). */
  installments(clientId: string): Promise<OpenInstallment[]>;
  /** Registra tentativa do PIN (bloqueio após 5 erros fica no banco). */
  pin(clientId: string, ok: boolean): Promise<PinResult>;
  asaas(clientId: string, rentalId: string, receiptId: string, kind: "PIX" | "BOLETO"): Promise<{ pix?: string | null; invoiceUrl?: string | null; line?: string | null }>;
  infinitepay(clientId: string, rentalId: string, receiptId: string): Promise<{ url: string }>;
  /** Link Mercado Pago / PagBank / Pagar.me (Pix, cartão ou boleto). */
  gateway(clientId: string, provider: GatewayId, rentalId: string, receiptId: string): Promise<{ url: string }>;
  pixManual(clientId: string, rentalId: string, receiptId: string): Promise<{ code: string | null; key: string; name: string; amount: number }>;
  proof(clientId: string, rentalId: string, receiptId: string, media: Media): Promise<{ amount: number }>;
  /* Etapa 2 */
  rentals(clientId: string): Promise<RentalView[]>;
  incident(clientId: string, rentalId: string, category: string, description: string, photos: string[], requestId: string): Promise<{ id: string }>;
  /** Grava a mídia no bucket da ação, na pasta do cliente; devolve o caminho. */
  upload(clientId: string, bucket: "ocorrencias" | "documentos" | "vistorias", media: Media, folder?: string): Promise<string>;
  document(clientId: string, kind: string, path: string): Promise<{ id: string }>;
  contractLink(clientId: string, processId: string): Promise<{ url: string }>;
  /* Etapa 3 */
  fleet(): Promise<FleetItem[]>;
  reservations(clientId: string): Promise<ReservationView[]>;
  reserve(clientId: string, vehicleId: string, startDate: string, endDate: string): Promise<{ vehicleName: string }>;
  cancelReservation(clientId: string, id: string): Promise<void>;
  lead(name: string, vehicleId: string | null, startDate: string | null, endDate: string | null): Promise<void>;
}

const APP_ID = "app";
const MENU: Opt = { id: "menu", title: "🏠 Menu" };
const appBtn = (): Opt => ({ id: APP_ID, title: "📱 Abrir App Oficial" });
const MAX_ROWS = 10;
const MAX_INCIDENT_PHOTOS = 6;

/** Toda conclusão termina com o convite ao App Oficial (botão + link no texto). */
function done(cfg: CustomerConfig, text: string, extra: Opt[] = [], appUrl = cfg.appUrl): Reply {
  return { text: `${text}\n\n📱 *App Oficial da ${cfg.orgName}:* ${appUrl}\nAcompanhe tudo, pague e envie documentos pelo app.`, buttons: [...extra, appBtn(), MENU].slice(0, 3) };
}

/** Botões da cobrança automática: ids iguais aos do fluxo, então o toque cai direto no pagamento da parcela. */
export function chargeButtons(ref: string, m: CustomerConfig["methods"]): Opt[] {
  const pix = m.asaasPix ? `m:asaas_pix:${ref}` : m.pixManual ? `m:pixm:${ref}` : null;
  return [
    ...(pix ? [{ id: pix, title: "💳 Pagar Pix" }] : []),
    ...(m.infinitepay ? [{ id: `m:ip:${ref}`, title: "🔗 Cartão" }] : m.gateways?.length ? [{ id: `m:${m.gateways[0]}:${ref}`, title: "🔗 Cartão" }] : []),
    { id: APP_ID, title: "📱 Abrir App" },
  ];
}

/** "25/12", "25/12/2026" ou "2026-12-25" → ISO (ano corrente; se já passou, o próximo). */
export function parseDate(text: string, today: string): string | null {
  const t = text.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (br) {
    [d, m] = [Number(br[1]), Number(br[2])];
    y = br[3] ? Number(br[3].length === 2 ? `20${br[3]}` : br[3]) : Number(today.slice(0, 4));
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  let out = dt.toISOString().slice(0, 10);
  if (!iso && !br?.[3] && out < today) out = `${y + 1}${out.slice(4)}`;
  return out;
}

export async function handleCustomer(
  ev: CopilotEvent,
  session: CustomerSession,
  cfg: CustomerConfig,
  ports: CustomerPorts,
  media?: Media,
): Promise<{ replies: Reply[]; session: CustomerSession }> {
  const replies: Reply[] = [];
  const say = (r: Reply): void => { replies.push(r); };
  let next: CustomerSession = { ...session, step: "menu", data: {} };
  const keep = (step: string, data: Record<string, unknown> = {}) => { next = { ...next, step, data }; };
  // Id de idempotência no formato aceito pelas rotas do app ([A-Za-z0-9_-], 8–64).
  const newReq = (prefix = "wa") => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

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
      { id: "v:rent", title: "📅 Quero alugar", description: "Deixe seu interesse" },
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
    if (session.verified || next.verified) return true;
    if (session.locked) { say(done(cfg, "🔒 Muitas tentativas incorretas. Por segurança, tente novamente em 30 minutos.")); return false; }
    keep("pin", { resume });
    say({ text: "🔐 Para sua segurança, digite os *4 primeiros dígitos do seu CPF*.", buttons: [MENU] });
    return false;
  };

  /* ---------------- Etapa 1: pagamentos ---------------- */
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
      ...(m.gateways ?? []).map((g) => ({ id: `m:${g}:${ref}`, title: `💳 ${GATEWAYS[g].label.replace(/ \(.*\)$/, "")}`.slice(0, 24), description: "Pix, cartão até 12x ou boleto" })),
      ...(m.pixManual ? [{ id: `m:pixm:${ref}`, title: "📲 Pix + comprovante", description: "Envie o comprovante aqui" }] : []),
    ];
    if (!opts.length) return say(done(cfg, "No momento o pagamento online está indisponível. Fale com a locadora."));
    say({ text: `🧾 *${i.label}*${i.plate ? ` · ${i.plate}` : ""}\nVencimento: ${formatDate(i.dueDate)}${i.daysLate ? ` (${i.daysLate} dia(s) de atraso)` : ""}\nValor: ${formatCurrency(i.amount)}${i.total !== i.amount ? `\n*Total atualizado: ${formatCurrency(i.total)}* (multa/juros)` : ""}\n\nComo deseja pagar?`, list: { button: "Formas de pagamento", rows: opts } });
  };

  const pay = async (method: string, ref: string) => {
    const [rentalId, receiptId] = ref.split("|");
    const i = await findInstallment(ref);
    if (!i) return say(done(cfg, "Esta parcela não está mais em aberto."));
    const enabled = method === "asaas_pix" ? cfg.methods.asaasPix : method === "asaas_boleto" ? cfg.methods.asaasBoleto : method === "ip" ? cfg.methods.infinitepay : method === "pixm" ? cfg.methods.pixManual : isGateway(method) ? Boolean(cfg.methods.gateways?.includes(method)) : false;
    if (!enabled) return methodChoice(ref); // botão antigo de método desligado: mostra só os ativos
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
    if (isGateway(method)) {
      const r = await ports.gateway(clientId!, method, rentalId, receiptId);
      return say(done(cfg, `💳 *Pagar ${formatCurrency(i.total)}*\nPix, cartão em até 12x ou boleto pelo ${GATEWAYS[method].label.replace(/ \(.*\)$/, "")}:\n${r.url}\n\nA confirmação é automática.`));
    }
    const r = await ports.pixManual(clientId!, rentalId, receiptId);
    keep("proof", { ref });
    say({ text: `📲 *Pix — ${formatCurrency(r.amount)}*\nRecebedor: ${r.name}\nChave: ${r.key}${r.code ? "\n\nOu use o Pix copia e cola abaixo:" : ""}` });
    if (r.code) say({ text: r.code });
    say({ text: "Depois de pagar, *envie aqui a foto ou o PDF do comprovante*. A equipe confere e dá baixa.", buttons: [MENU] });
  };

  /* ---------------- Etapa 2: locação, ocorrência, documentos, contrato ---------------- */
  const activeRentals = async () => (await ports.rentals(clientId!)).filter((r) => r.status === "active" || r.status === "late" || r.status === "pending");

  /** Escolhe a locação (pula a pergunta quando só existe uma). */
  const pickRental = async (prefix: string, title: string) => {
    const list = await activeRentals();
    if (!list.length) { say(done(cfg, "Você não tem locação em andamento.")); return null; }
    if (list.length === 1) return list[0];
    say({ text: title, list: { button: "Ver locações", rows: list.slice(0, MAX_ROWS).map((r) => ({ id: `${prefix}:${r.id}`, title: (r.vehicle?.plate ?? r.vehicle?.name ?? "Locação").slice(0, 24), description: `${formatDate(r.startDate)} a ${formatDate(r.endDate)}` })) } });
    return null;
  };

  const rentalSummary = async () => {
    const list = await ports.rentals(clientId!);
    if (!list.length) return say(done(cfg, "Você ainda não tem locações."));
    const open = await ports.installments(clientId!);
    const blocks = list.slice(0, 3).map((r) => {
      const next = open.filter((i) => i.rentalId === r.id).slice(0, 3);
      const fines = r.fines.filter((f) => f.status !== "paid");
      return [
        `🚗 *${r.vehicle?.name ?? "Veículo"}* · ${r.vehicle?.plate ?? "—"}`,
        `Status: ${r.status === "late" ? "em atraso" : r.status === "active" ? "ativa" : r.status === "pending" ? "aguardando início" : "encerrada"} · ${formatDate(r.startDate)} a ${formatDate(r.endDate)}`,
        r.vehicle?.odometer != null ? `KM atual: ${formatNumber(r.vehicle.odometer)}` : "",
        next.length ? `Próximas parcelas: ${next.map((i) => `${formatDate(i.dueDate)} ${formatCurrency(i.total)}`).join(" · ")}` : "Parcelas: nada em aberto ✅",
        r.maintenance.length ? `Manutenções: ${r.maintenance.slice(0, 3).map((m) => `${formatDate(m.date)} ${m.description}`).join("; ")}` : "",
        fines.length ? `⚠️ Multas em aberto: ${fines.map((f) => `${formatDate(f.infractionDate)} ${formatCurrency(f.amount)}`).join(" · ")}` : "",
      ].filter(Boolean).join("\n");
    });
    say(done(cfg, `📋 *Minha locação*\n\n${blocks.join("\n\n")}`, open.length ? [{ id: "c:pay", title: "💰 Pagar" }] : []));
  };

  const incidentStart = async (rentalId?: string) => {
    const rental = rentalId ? (await activeRentals()).find((r) => r.id === rentalId) : await pickRental("inc_r", "🛠️ Para qual veículo é a ocorrência?");
    if (!rental) return;
    keep("inc_cat", { rentalId: rental.id });
    say({ text: `🛠️ *Ocorrência* · ${rental.vehicle?.plate ?? ""}\nQual o tipo do problema?`, list: { button: "Tipo do problema", rows: Object.entries(INCIDENT_CATEGORY).map(([k, v]) => ({ id: `inc_c:${k}`, title: v })) } });
  };

  const incidentConfirm = async (d: Record<string, unknown>) => {
    const photos = (d.photos as string[]) ?? [];
    const r = await ports.incident(clientId!, String(d.rentalId), String(d.category), String(d.description), photos, String(d.requestId));
    say(done(cfg, `✅ *Ocorrência registrada* (${INCIDENT_CATEGORY[String(d.category)]})${photos.length ? ` com ${photos.length} foto(s)` : ""}.\nA equipe já foi avisada e responde por aqui ou pelo app.${String(d.category) === "acidente" ? "\n\n🚨 Em caso de feridos, ligue 192 (SAMU) ou 193 (Bombeiros)." : ""}`));
    return r;
  };

  const docsStart = () => {
    keep("doc_kind");
    say({ text: "📄 Qual documento você quer enviar?", list: { button: "Documento", rows: Object.entries(DOCUMENT_KIND).map(([k, v]) => ({ id: `doc_k:${k}`, title: v })) } });
  };

  const contract = async () => {
    const list = (await ports.rentals(clientId!)).filter((r) => r.contract);
    if (!list.length) return say(done(cfg, "Ainda não há contrato disponível para assinatura."));
    const r = list[0];
    const c = r.contract!;
    const label = c.status === "completed" ? "✅ Assinado" : c.status === "awaiting_signature" || c.status === "partially_signed" || c.status === "sending" ? "⏳ Aguardando sua assinatura" : c.status === "rejected" ? "❌ Recusado" : c.status === "expired" ? "⌛ Expirado" : c.status;
    if (c.status === "completed" || c.status === "awaiting_signature" || c.status === "partially_signed") {
      const { url } = await ports.contractLink(clientId!, c.processId);
      return say(done(cfg, `✍️ *Contrato* · ${r.vehicle?.plate ?? ""}\nStatus: ${label}\n\n${c.status === "completed" ? "Baixe o contrato assinado:" : "Assine pelo link oficial (Autentique):"}\n${url}`));
    }
    say(done(cfg, `✍️ *Contrato* · ${r.vehicle?.plate ?? ""}\nStatus: ${label}\nSe precisar, fale com a ${cfg.orgName}.`));
  };

  /* ---------------- Etapa 3: reserva, visitante, vistoria ---------------- */
  const fleetList = async (prefix: string, title: string) => {
    const fleet = await ports.fleet();
    if (!fleet.length) return say(done(cfg, "No momento não há carros disponíveis. Tente novamente mais tarde."));
    say({ text: title, list: { button: "Ver carros", rows: fleet.slice(0, MAX_ROWS).map((v) => ({ id: `${prefix}:${v.id}`, title: v.name.slice(0, 24), description: [v.category, v.weeklyRate ? `${formatCurrency(v.weeklyRate)}/semana` : v.dailyRate ? `${formatCurrency(v.dailyRate)}/dia` : ""].filter(Boolean).join(" · ").slice(0, 72) })) } });
  };

  const reserveMenu = async () => {
    const mine = (await ports.reservations(clientId!)).filter((r) => r.status === "pending" || r.status === "confirmed");
    const rows: Opt[] = [{ id: "res_new", title: "➕ Pedir reserva", description: "Escolha carro e datas" }, ...mine.slice(0, 8).map((r) => ({ id: `res_x:${r.id}`, title: `❌ ${r.vehicleName}`.slice(0, 24), description: `Cancelar ${formatDate(r.startDate)} a ${formatDate(r.endDate)}` }))];
    say({ text: `📅 *Reservas*${mine.length ? `\nVocê tem ${mine.length} reserva(s) ativa(s):\n${mine.map((r) => `• ${r.vehicleName} · ${formatDate(r.startDate)} a ${formatDate(r.endDate)} · ${r.status === "pending" ? "aguardando confirmação" : "confirmada"}`).join("\n")}` : ""}`, list: { button: "Opções", rows } });
  };

  const inspectionKinds = () => Object.entries(TENANT_INSPECTION_KIND).filter(([k]) => k !== "periodic" || cfg.periodicCheckin !== false);
  const inspectionStart = async (rentalId?: string) => {
    const rental = rentalId ? (await activeRentals()).find((r) => r.id === rentalId) : await pickRental("insp_r", "📸 Vistoria de qual veículo?");
    if (!rental) return;
    keep("insp_kind", { rentalId: rental.id });
    say({ text: `📸 *Vistoria* · ${rental.vehicle?.plate ?? ""}\nQual o tipo?`, buttons: inspectionKinds().map(([k, v]) => ({ id: `insp_k:${k}`, title: v })) });
  };

  const askPhoto = (d: Record<string, unknown>) => {
    const got = (d.photos as Record<string, string>) ?? {};
    const slot = PHOTO_SLOTS.find((s) => !got[s.key]);
    if (!slot) return null;
    const n = PHOTO_SLOTS.findIndex((s) => s.key === slot.key) + 1;
    keep("insp_photo", d);
    say({ text: `📸 Foto ${n} de ${PHOTO_SLOTS.length}: *${slot.label}*\nEnvie a foto agora (com boa luz, o carro inteiro no enquadramento).`, buttons: [{ id: "insp_app", title: "📱 Fazer no App" }, MENU] });
    return slot.key;
  };

  /** Link direto para a tela de vistoria do App (que carrega sozinha as fotos já enviadas aqui). */
  const inspectionUrl = (kind: unknown) => {
    const u = new URL(cfg.appUrl);
    u.pathname = `${u.pathname.replace(/\/+$/, "")}/vistoria`;
    u.searchParams.set("kind", String(kind));
    return u.toString();
  };

  const route = async (id: string): Promise<void> => {
    const i = id.indexOf(":");
    const [cmd, arg] = i < 0 ? [id, ""] : [id.slice(0, i), id.slice(i + 1)];
    if (cmd === "menu") return menu();
    if (cmd === APP_ID) return say(done(cfg, `Baixe e use o *App Oficial da ${cfg.orgName}*: lá você acompanha sua locação, paga, envia documentos e faz a vistoria.`));
    if (cmd === "v") {
      if (arg === "fleet") return fleetList("lead_v", "🚗 *Carros disponíveis*\nEscolha um para registrar seu interesse:");
      if (arg === "rent") return fleetList("lead_v", "📅 *Quero alugar*\nQual carro te interessa?");
      return visitorMenu();
    }
    if (cmd === "lead_v") {
      keep("lead_start", { vehicleId: arg });
      return say({ text: "📅 A partir de quando você precisa do carro?\nDigite a data (ex.: *25/12*) ou toque em *Ainda não sei*.", buttons: [{ id: "lead_d:skip", title: "Ainda não sei" }, MENU] });
    }
    if (cmd === "lead_d") { keep("lead_name", { ...session.data, startDate: null, endDate: null }); return say({ text: "Qual é o seu *nome*?" }); }
    // Daqui em diante: só cliente cadastrado.
    if (!clientId) return visitorMenu();

    if (cmd === "c") {
      if (arg === "pay") return installmentList();
      if (!requireVerified(`c:${arg}`)) return;
      if (arg === "rental") return rentalSummary();
      if (arg === "incident") return incidentStart();
      if (arg === "docs") return docsStart();
      if (arg === "contract") return contract();
      if (arg === "reserve") return reserveMenu();
      if (arg === "inspection") return inspectionStart();
      return menu();
    }
    // Botões da cobrança automática (charge.ts) usam estes mesmos ids: caem direto na parcela, sem menu.
    if (cmd === "pay") return methodChoice(arg);
    if (cmd === "m") {
      const j = arg.indexOf(":");
      return pay(arg.slice(0, j), arg.slice(j + 1));
    }
    // Sensíveis: mesmo após clicar num botão antigo, exigem a verificação válida.
    if (!requireVerified(id)) return;
    if (cmd === "inc_r") return incidentStart(arg);
    if (cmd === "inc_c") {
      if (!(arg in INCIDENT_CATEGORY) || !session.data.rentalId) return incidentStart();
      keep("inc_desc", { rentalId: session.data.rentalId, category: arg });
      return say({ text: `✍️ Descreva o problema (${INCIDENT_CATEGORY[arg]}), com pelo menos 10 letras.\nEx.: *pneu dianteiro furou na Av. Brasil*`, buttons: [MENU] });
    }
    if (cmd === "inc_ok") {
      if (session.step !== "inc_photos") return menu();
      await incidentConfirm(session.data);
      return;
    }
    if (cmd === "doc_k") {
      if (!(arg in DOCUMENT_KIND)) return docsStart();
      keep("doc_file", { kind: arg });
      return say({ text: `📎 Envie agora a *foto ou o PDF* de: *${DOCUMENT_KIND[arg]}*\n(legível, sem cortes, até 7 MB)`, buttons: [MENU] });
    }
    if (cmd === "res_new") return fleetList("res_v", "📅 *Pedir reserva*\nEscolha o carro:");
    if (cmd === "res_v") {
      keep("res_start", { vehicleId: arg });
      return say({ text: "📅 Data de *retirada*? (ex.: *25/12*)", buttons: [MENU] });
    }
    if (cmd === "res_x") {
      await ports.cancelReservation(clientId, arg);
      return say(done(cfg, "✅ Reserva cancelada."));
    }
    if (cmd === "insp_r") return inspectionStart(arg);
    if (cmd === "insp_k") {
      if (!inspectionKinds().some(([k]) => k === arg) || !session.data.rentalId) return inspectionStart();
      const d = { rentalId: session.data.rentalId, kind: arg, requestId: newReq(`wa-${arg}`), photos: {} };
      say({ text: `📸 Vou pedir ${PHOTO_SLOTS.length} fotos, uma de cada vez. No fim, você só confere e assina no App.` });
      askPhoto(d);
      return;
    }
    if (cmd === "insp_app") {
      const d = session.data;
      if (Object.keys((d.photos as Record<string, string>) ?? {}).length) return say(done(cfg, "📱 Suas fotos já estão salvas. Abra a vistoria no App para tirar as que faltam, revisar e assinar.", [], inspectionUrl(d.kind)));
      return say(done(cfg, "📱 Faça a vistoria completa pelo App Oficial (fotos, checklist e assinatura).", [], d.kind ? inspectionUrl(d.kind) : cfg.appUrl));
    }
    return menu();
  };

  // Texto/mídia dentro de uma etapa guiada.
  const stepInput = async (): Promise<boolean> => {
    const d = session.data;
    const text = ev.kind === "text" ? ev.text : "";
    if (session.step === "lead_start" && ev.kind === "text") {
      const start = parseDate(text, cfg.today);
      if (!start || start < cfg.today) { keep(session.step, d); say({ text: "Data inválida. Digite, por exemplo, *25/12*.", buttons: [{ id: "lead_d:skip", title: "Ainda não sei" }, MENU] }); return true; }
      keep("lead_end", { ...d, startDate: start });
      say({ text: `E a *devolução*? (ex.: ${formatDate(addDays(start, 7)).slice(0, 5)})`, buttons: [MENU] });
      return true;
    }
    if (session.step === "lead_end" && ev.kind === "text") {
      const end = parseDate(text, cfg.today);
      if (!end || end < String(d.startDate)) { keep(session.step, d); say({ text: "A devolução precisa ser depois da retirada. Digite a data (ex.: *30/12*).", buttons: [MENU] }); return true; }
      keep("lead_name", { ...d, endDate: end });
      say({ text: "Qual é o seu *nome*?" });
      return true;
    }
    if (session.step === "lead_name" && ev.kind === "text") {
      const name = text.replace(/\s+/g, " ").trim();
      if (name.length < 2 || name.length > 80 || /\d{3,}/.test(name)) { keep(session.step, d); say({ text: "Digite só o seu nome." }); return true; }
      await ports.lead(name, (d.vehicleId as string) ?? null, (d.startDate as string) ?? null, (d.endDate as string) ?? null);
      say(done(cfg, `✅ Obrigado, ${firstName(name)}! A ${cfg.orgName} recebeu seu interesse e vai falar com você.\n\nPara agilizar, crie sua conta no App Oficial e envie CNH, comprovante de endereço e selfie: assim a locação é aprovada mais rápido.`));
      return true;
    }
    if (!clientId) return false;
    if (session.step === "inc_desc" && ev.kind === "text") {
      if (text.trim().length < 10) { keep(session.step, d); say({ text: "Descreva com pelo menos 10 letras, por favor.", buttons: [MENU] }); return true; }
      keep("inc_photos", { ...d, description: text.trim().slice(0, 2000), photos: [], requestId: newReq() });
      say({ text: `📷 Se puder, envie até ${MAX_INCIDENT_PHOTOS} fotos do problema. Quando terminar, toque em *Registrar*.`, buttons: [{ id: "inc_ok", title: "✅ Registrar" }, MENU] });
      return true;
    }
    if (session.step === "inc_photos" && ev.kind === "text" && /^(registrar|pular|pronto|ok|enviar)$/i.test(text.trim())) {
      await incidentConfirm(d);
      return true;
    }
    if (session.step === "inc_photos" && (ev.kind === "image" || ev.kind === "document")) {
      const photos = (d.photos as string[]) ?? [];
      if (!media || ev.kind === "document") { keep(session.step, d); say({ text: "Envie uma *foto* (JPG/PNG).", buttons: [{ id: "inc_ok", title: "✅ Registrar" }, MENU] }); return true; }
      if (photos.length >= MAX_INCIDENT_PHOTOS) { keep(session.step, d); say({ text: `Já recebi ${MAX_INCIDENT_PHOTOS} fotos. Toque em *Registrar*.`, buttons: [{ id: "inc_ok", title: "✅ Registrar" }, MENU] }); return true; }
      const path = await ports.upload(clientId, "ocorrencias", media);
      keep(session.step, { ...d, photos: [...photos, path] });
      say({ text: `📷 Foto ${photos.length + 1} recebida. Envie outra ou toque em *Registrar*.`, buttons: [{ id: "inc_ok", title: "✅ Registrar" }, MENU] });
      return true;
    }
    if (session.step === "doc_file" && (ev.kind === "image" || ev.kind === "document")) {
      if (!media) { keep(session.step, d); say({ text: "Não consegui ler o arquivo. Envie uma foto (JPG/PNG) ou PDF de até 7 MB.", buttons: [MENU] }); return true; }
      const path = await ports.upload(clientId, "documentos", media);
      await ports.document(clientId, String(d.kind), path);
      say(done(cfg, `✅ *${DOCUMENT_KIND[String(d.kind)]}* recebido. Está em análise pela equipe; você recebe o resultado pelo app.`, [{ id: "c:docs", title: "📄 Outro documento" }]));
      return true;
    }
    if (session.step === "res_start" && ev.kind === "text") {
      const start = parseDate(text, cfg.today);
      if (!start || start < cfg.today) { keep(session.step, d); say({ text: "Data inválida. Digite a retirada, ex.: *25/12*.", buttons: [MENU] }); return true; }
      keep("res_end", { ...d, startDate: start });
      say({ text: "Data de *devolução*? (ex.: *30/12*)", buttons: [MENU] });
      return true;
    }
    if (session.step === "res_end" && ev.kind === "text") {
      const end = parseDate(text, cfg.today);
      if (!end || end < String(d.startDate)) { keep(session.step, d); say({ text: "A devolução precisa ser depois da retirada. Digite a data.", buttons: [MENU] }); return true; }
      const r = await ports.reserve(clientId, String(d.vehicleId), String(d.startDate), end);
      say(done(cfg, `✅ *Pedido de reserva enviado*\n${r.vehicleName} · ${formatDate(String(d.startDate))} a ${formatDate(end)}\nA ${cfg.orgName} confirma e você recebe o aviso.`));
      return true;
    }
    if (session.step === "insp_photo" && (ev.kind === "image" || ev.kind === "document")) {
      const photos = (d.photos as Record<string, string>) ?? {};
      const slot = PHOTO_SLOTS.find((s) => !photos[s.key]);
      if (!slot) return false;
      if (!media || ev.kind === "document") { keep(session.step, d); say({ text: `Envie uma *foto* (JPG/PNG) de: *${slot.label}*.`, buttons: [{ id: "insp_app", title: "📱 Fazer no App" }, MENU] }); return true; }
      const path = await ports.upload(clientId, "vistorias", media, `${String(d.rentalId)}/app/${String(d.requestId)}/${slot.key}_${PHOTO_SLOTS.indexOf(slot)}`);
      const nd = { ...d, photos: { ...photos, [slot.key]: path } };
      if (askPhoto(nd)) return true;
      // 9 fotos na pasta da vistoria (Storage): o App as carrega como rascunho; o cliente revisa, faz o checklist e assina.
      say(done(cfg, `✅ *Todas as ${PHOTO_SLOTS.length} fotos recebidas!*\nAgora abra a vistoria no App: as fotos já estarão lá. Só confira a quilometragem, o combustível, o checklist e *assine na tela* para concluir.`, [], inspectionUrl(d.kind)));
      return true;
    }
    return false;
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
    } else if (ev.kind === "text" && isMenuCommand(ev.text)) menu();
    else if (ev.kind === "action") await route(ev.id);
    else if (await stepInput()) { /* tratado na etapa guiada */ }
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
