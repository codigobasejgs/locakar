/**
 * Menu do Copiloto no WhatsApp: máquina de estados determinística (sem IA).
 * Puro: dados e efeitos chegam por `ports`, então o mesmo fluxo roda no webhook, no simulador e nos testes.
 * Toda escrita vira ação pendente e só executa depois de [Confirmar] (claim atômico no banco).
 */
import { dashboardExecutiveTotals, presetDateRange, vehicle360, type DatePresetKey } from "../analytics";
import { billingOf, lateCharges } from "../billing";
import { VEHICLE_STATUS } from "../constants";
import type { Client, Expense, Fine, FleetVehicle, Maintenance, Rental, Reservation } from "../../types";
import { formatCurrency, formatDate, formatNumber, daysBetween } from "../utils";
import { allowed } from "./guard";
import { isMenuCommand, parseAmount, type CopilotEvent } from "./parse";

export interface Opt { id: string; title: string; description?: string }
export interface Reply { text: string; buttons?: Opt[]; list?: { button: string; rows: Opt[] } }
export interface Session { step: string; data: Record<string, unknown> }
export interface FlowConfig { level: number; mode: "buttons" | "hybrid"; aiAvailable: boolean; orgName: string }
export interface FlowData { vehicles: FleetVehicle[]; clients: Client[]; rentals: Rental[]; reservations: Reservation[]; expenses: Expense[]; maintenance: Maintenance[]; fines: Fine[] }
export type PendingType = "settle_receipt" | "create_expense" | "create_maintenance";
export type Claim = { result: "claimed" | "already" | "not_found" | "invalid"; status?: string; type?: PendingType; payload?: Record<string, unknown> };

/** Intenção extraída pela IA (só preenche dados; a confirmação é sempre por botão). */
export type AiIntent =
  | { intent: "settle"; client?: string; plate?: string; amount?: number }
  | { intent: "expense"; plate?: string; amount: number; description: string }
  | { intent: "maintenance"; plate?: string; km?: number; amount: number; description: string; supplier?: string }
  | { intent: "report"; period?: DatePresetKey }
  | { intent: "pendings" | "maintenance_status" | "menu" | "unknown" };

export interface FlowPorts {
  data(): Promise<FlowData>;
  createPending(type: PendingType, payload: Record<string, unknown>): Promise<string>;
  claim(id: string, decision: "CONFIRMED" | "CANCELLED"): Promise<Claim>;
  execute(type: PendingType, payload: Record<string, unknown>): Promise<string>;
  notifyClient(rentalId: string, receiptId: string): Promise<string>;
  ai?(input: { text?: string; media?: { kind: "audio" | "image" | "document"; mimetype: string; data: string } }): Promise<AiIntent>;
}

const MENU: Opt = { id: "menu", title: "🏠 Menu" };
const CATEGORIES: Opt[] = [
  { id: "exp_c:Peças/Oficina", title: "🔧 Peças/Oficina" },
  { id: "exp_c:Pneu/Óleo", title: "🛞 Pneu/Óleo" },
  { id: "exp_c:IPVA/Documentação", title: "📄 IPVA/Doc" },
  { id: "exp_c:Outros", title: "📌 Outros" },
];
const PERIODS: Opt[] = [
  { id: "fin:this_month", title: "📅 Este mês" },
  { id: "fin:last_3_months", title: "📆 Últimos 3 meses" },
  { id: "fin:last_6_months", title: "📈 Últimos 6 meses" },
  { id: "fin:this_year", title: "🏆 Este ano" },
];
const MAX_ROWS = 10;

/** Texto final: opções numeradas sempre presentes (aparelhos sem botões respondem com o número). */
export function render(r: Reply) {
  const opts = r.list?.rows ?? r.buttons ?? [];
  const numbered = opts.length ? `\n\n${opts.map((o, i) => `${i + 1}. ${o.title}${o.description ? ` — ${o.description}` : ""}`).join("\n")}\n_Responda com o número ou toque na opção._` : "";
  return { text: r.text + numbered, options: opts };
}

type Open = { rental: Rental; receiptId: string; due: string; amount: number; total: number; days: number; client?: Client; vehicle?: FleetVehicle };

function openReceipts(d: FlowData, today: string, filter: "today" | "late" | "all" | "any"): Open[] {
  const out: Open[] = [];
  for (const rental of d.rentals) {
    if (rental.status === "cancelled") continue;
    for (const x of rental.receipts) {
      if (x.paid || x.cancelled) continue;
      if (filter === "today" && x.dueDate !== today) continue;
      if (filter === "late" && x.dueDate >= today) continue;
      if (filter === "all" && x.dueDate > today) continue;
      const ch = x.dueDate < today ? lateCharges(x.amount, x.dueDate, today, billingOf(rental)) : { total: x.amount };
      out.push({ rental, receiptId: x.id, due: x.dueDate, amount: x.amount, total: ch.total, days: Math.max(0, daysBetween(x.dueDate, today)), client: d.clients.find((c) => c.id === rental.clientId), vehicle: d.vehicles.find((v) => v.id === rental.vehicleId) });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plateOf = (s?: string) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const vLabel = (v?: FleetVehicle) => (v ? `${v.plate} • ${v.model || v.name}` : "Sem veículo");
const payId = (o: Open) => `${o.rental.id}|${o.receiptId}`;

export async function handle(ev: CopilotEvent, session: Session, cfg: FlowConfig, ports: FlowPorts, today: string, media?: { mimetype: string; data: string }): Promise<{ replies: Reply[]; session: Session }> {
  const replies: Reply[] = [];
  let next: Session = { step: "menu", data: {} };
  const say = (r: Reply): void => { replies.push(r); };
  const canWrite = allowed(cfg, "write");
  let cache: FlowData | undefined;
  const data = async () => (cache ??= await ports.data());

  const menu = async () => {
    const d = await data();
    const paidToday = d.rentals.flatMap((r) => r.receipts).filter((x) => x.paid && x.paidAt === today).reduce((s, x) => s + (x.amountPaid ?? x.amount), 0);
    const dueToday = openReceipts(d, today, "today").reduce((s, o) => s + o.amount, 0);
    const late = new Set(openReceipts(d, today, "late").map((o) => o.rental.clientId)).size;
    const openMnt = d.maintenance.filter((m) => m.status !== "done").length;
    say({
      text: `🚗 *PAINEL — ${cfg.orgName}*\n\n💵 Recebido hoje: ${formatCurrency(paidToday)}\n⚠️ Em aberto hoje: ${formatCurrency(dueToday)}\n🚨 Inadimplentes: ${late} cliente(s)\n🔧 Manutenções abertas: ${openMnt}`,
      list: { button: "Abrir menu", rows: [
        { id: "m:charges", title: "💰 Cobranças e Baixas", description: "Quem deve hoje, atrasados e baixa" },
        { id: "m:fin", title: "📊 Resumo Financeiro", description: "Faturamento, custos e lucro" },
        ...(canWrite ? [{ id: "m:exp", title: "💸 Registrar Despesa", description: "Passo a passo guiado" }] : []),
        { id: "m:mnt", title: "🔧 Manutenções", description: "Pendências e lançamentos" },
        { id: "m:fleet", title: "🚗 Frota e Locações", description: "Status, KM e contratos" },
        { id: "m:clients", title: "👥 Clientes", description: "Buscar cliente" },
      ] },
    });
  };

  const receiptsList = async (filter: "today" | "late" | "all", title: string, query?: string) => {
    const d = await data();
    let list = openReceipts(d, today, filter);
    if (query) {
      const q = norm(query), p = plateOf(query);
      list = list.filter((o) => norm(o.client?.name ?? "").includes(q) || (p.length >= 3 && plateOf(o.vehicle?.plate).includes(p)));
    }
    if (!list.length) return say({ text: `${title}\n\nNenhuma parcela em aberto. ✅`, buttons: [MENU] });
    const total = list.reduce((s, o) => s + o.total, 0);
    say({
      text: `${title}\n\n${list.length} parcela(s) · total atualizado ${formatCurrency(total)}${list.length > MAX_ROWS ? `\nMostrando ${MAX_ROWS}. Use 🔍 Buscar para filtrar.` : ""}`,
      list: { button: "Ver parcelas", rows: list.slice(0, MAX_ROWS).map((o) => ({ id: `pay:${payId(o)}`, title: `${o.client?.name.split(" ")[0] ?? "Cliente"} • ${o.vehicle?.plate ?? "—"}`, description: `${formatCurrency(o.total)} · venc. ${formatDate(o.due)}${o.days ? ` · ${o.days}d atraso` : ""}` })) },
    });
  };

  const findOpen = async (ref: string) => {
    const [rentalId, receiptId] = ref.split("|");
    return openReceipts(await data(), today, "any").find((o) => o.rental.id === rentalId && o.receiptId === receiptId);
  };

  const confirmCard = async (type: PendingType, payload: Record<string, unknown>, text: string) => {
    if (!canWrite) return say({ text: "🔒 Seu nível do Copiloto é *Básico (somente leitura)*. Lançamentos estão bloqueados.", buttons: [MENU] });
    const id = await ports.createPending(type, payload);
    say({ text: `${text}\n\nConfirma no sistema?`, buttons: [{ id: `confirm_action:${id}`, title: "✅ Confirmar" }, { id: `cancel_action:${id}`, title: "❌ Cancelar" }] });
  };

  const settleCard = async (o: Open, amount: number) => {
    const extra = amount > o.amount ? "com juros/multa" : amount < o.amount ? "valor parcial" : "sem juros/multa";
    await confirmCard("settle_receipt", { rentalId: o.rental.id, receiptId: o.receiptId, amount, label: `${o.client?.name ?? "Cliente"} (${o.vehicle?.plate ?? "—"})` },
      `💰 *Dar baixa em parcela*\nLocatário: ${o.client?.name ?? "—"}\nVeículo: ${vLabel(o.vehicle)}\nVencimento: ${formatDate(o.due)}${o.days ? ` (${o.days} dia(s) de atraso)` : ""}\nValor original: ${formatCurrency(o.amount)}\nValor recebido: ${formatCurrency(amount)} • ${extra}`);
  };

  const report = async (key: DatePresetKey) => {
    const d = await data();
    const range = presetDateRange(key, today);
    const col = { ...d, notes: [], contracts: [], emails: [] };
    const t = dashboardExecutiveTotals(col, today, range.from, range.to);
    const margin = t.faturamentoRecebido ? Math.round((t.lucroLiquido / t.faturamentoRecebido) * 100) : 0;
    const ranking = d.vehicles.filter((v) => v.status !== "sold").map((v) => ({ v, r: vehicle360(v, col, today, range.from, range.to) })).filter((x) => x.r.faturamento || x.r.custos).sort((a, b) => b.r.lucro - a.r.lucro).slice(0, 10);
    say({
      text: `📊 *Resumo financeiro — ${range.label}*\n\n💵 Faturamento recebido: ${formatCurrency(t.faturamentoRecebido)}\n💸 Despesas + manutenções: ${formatCurrency(t.despesasTotal)}\n📈 Lucro líquido: ${formatCurrency(t.lucroLiquido)} (${margin}%)\n⚠️ Em atraso: ${formatCurrency(t.valoresEmAtraso)}${ranking.length ? `\n\n🏆 *Rendimento por veículo*\n${ranking.map((x, i) => `${i + 1}. ${vLabel(x.v)}: ${formatCurrency(x.r.lucro)} (bruto ${formatCurrency(x.r.faturamento)})`).join("\n")}` : ""}`,
      buttons: PERIODS.filter((p) => p.id !== `fin:${key}`).slice(0, 3),
    });
  };

  const vehicleList = (vs: FleetVehicle[], prefix: string, title: string, extra: Opt[] = []) =>
    say({ text: vs.length > MAX_ROWS ? `${title}\nMostrando ${MAX_ROWS} de ${vs.length}. Digite a placa para filtrar.` : title, list: { button: "Ver veículos", rows: [...extra, ...vs.slice(0, MAX_ROWS - extra.length).map((v) => ({ id: `${prefix}${v.id}`, title: v.plate, description: `${v.model || v.name} · ${VEHICLE_STATUS[v.status]?.label ?? v.status}` }))] } });

  const byPlate = async (plate?: string) => {
    const p = plateOf(plate);
    return p ? (await data()).vehicles.find((v) => plateOf(v.plate) === p) : undefined;
  };

  // Intenções vindas da IA caem nos mesmos fluxos determinísticos.
  const fromIntent = async (it: AiIntent) => {
    if (it.intent === "pendings") return receiptsList("all", "📋 *Pendências até hoje*");
    if (it.intent === "maintenance_status") return route("mnt:open");
    if (it.intent === "report") return report(it.period && PERIODS.some((p) => p.id === `fin:${it.period}`) ? it.period : "this_month");
    if (it.intent === "settle") {
      const d = await data();
      const v = await byPlate(it.plate);
      let list = openReceipts(d, today, "any");
      if (v) list = list.filter((o) => o.vehicle?.id === v.id);
      if (it.client) list = list.filter((o) => norm(o.client?.name ?? "").includes(norm(it.client!)));
      if (list.length === 1) return settleCard(list[0], it.amount && it.amount > 0 ? it.amount : list[0].total);
      if (!list.length) return say({ text: "Não encontrei parcela em aberto para esse cliente/placa.", buttons: [{ id: "ch:search", title: "🔍 Buscar" }, MENU] });
      return say({ text: "Encontrei mais de uma parcela. Qual deseja baixar?", list: { button: "Escolher", rows: list.slice(0, MAX_ROWS).map((o) => ({ id: `pay:${payId(o)}`, title: `${o.client?.name.split(" ")[0] ?? "Cliente"} • ${o.vehicle?.plate ?? "—"}`, description: `${formatCurrency(o.total)} · ${formatDate(o.due)}` })) } });
    }
    if (it.intent === "expense") {
      if (!(it.amount > 0)) return say({ text: "Não identifiquei o valor da despesa.", buttons: [{ id: "m:exp", title: "💸 Registrar despesa" }, MENU] });
      const v = await byPlate(it.plate);
      if (it.plate && !v) return say({ text: `Placa ${plateOf(it.plate)} não encontrada na frota.`, buttons: [{ id: "m:exp", title: "💸 Registrar despesa" }, MENU] });
      return confirmCard("create_expense", { vehicleId: v?.id ?? null, amount: it.amount, description: it.description.slice(0, 200), category: "Outros" }, `💸 *Nova despesa*\nVeículo: ${v ? vLabel(v) : "Geral da locadora"}\nDescrição: ${it.description}\nValor: ${formatCurrency(it.amount)}`);
    }
    if (it.intent === "maintenance") {
      const v = await byPlate(it.plate);
      if (!v) return say({ text: it.plate ? `Placa ${plateOf(it.plate)} não encontrada na frota.` : "Não identifiquei a placa do veículo na nota.", buttons: [{ id: "mnt:new", title: "➕ Lançar manualmente" }, MENU] });
      if (!(it.amount > 0)) return say({ text: "Não identifiquei o valor total da nota.", buttons: [{ id: "mnt:new", title: "➕ Lançar manualmente" }, MENU] });
      return maintenanceCard(v, it.km, it.amount, it.description, it.supplier);
    }
    if (it.intent === "menu") return menu();
    say({ text: "Não entendi o pedido. Use o menu abaixo.", buttons: [MENU] });
  };

  const maintenanceCard = (v: FleetVehicle, km: number | undefined, amount: number, description: string, supplier?: string) => {
    const validKm = km && km > 0 && km < 5_000_000 ? Math.round(km) : undefined;
    return confirmCard("create_maintenance", { vehicleId: v.id, km: validKm ?? null, amount, description: description.slice(0, 500), supplier: supplier?.slice(0, 120) ?? null },
      `🔧 *Nova manutenção*\nVeículo: ${vLabel(v)}\nKM: ${validKm ? formatNumber(validKm) : "mantido"}${validKm && v.odometer && validKm > v.odometer ? " (atualiza hodômetro)" : ""}\n${supplier ? `Oficina: ${supplier}\n` : ""}Serviço/peças: ${description}\nValor total: ${formatCurrency(amount)}\n\nO custo entra no Financeiro pela manutenção.`);
  };

  async function route(id: string): Promise<void> {
    const [cmd, arg = ""] = [id.slice(0, id.indexOf(":") >= 0 ? id.indexOf(":") : id.length), id.includes(":") ? id.slice(id.indexOf(":") + 1) : ""];
    switch (cmd) {
      case "menu": case "back": return menu();
      case "confirm_action": case "cancel_action": {
        const decision = cmd === "confirm_action" ? "CONFIRMED" : "CANCELLED";
        if (decision === "CONFIRMED" && !canWrite) return say({ text: "🔒 Nível Básico: confirmação de lançamentos bloqueada.", buttons: [MENU] });
        const c = await ports.claim(arg, decision);
        if (c.result === "already") return say({ text: c.status === "EXPIRED" ? "⏱️ Esta confirmação expirou. Refaça o lançamento." : `ℹ️ Esta ação já foi processada (${c.status === "CONFIRMED" ? "confirmada" : "cancelada"}). Nada foi repetido.`, buttons: [MENU] });
        if (c.result !== "claimed" || !c.type) return say({ text: "Ação não encontrada.", buttons: [MENU] });
        if (decision === "CANCELLED") return say({ text: "❌ Cancelado. Nada foi gravado.", buttons: [MENU] });
        return say({ text: await ports.execute(c.type, c.payload ?? {}), buttons: [MENU] });
      }
      case "m":
        if (arg === "charges") return say({ text: "💰 *Cobranças e Baixas*", buttons: [{ id: "ch:today", title: "📅 Vencendo hoje" }, { id: "ch:late", title: "🚨 Em atraso" }, { id: "ch:search", title: "🔍 Buscar" }] });
        if (arg === "fin") return say({ text: "📊 *Resumo Financeiro*\nEscolha o período:", list: { button: "Período", rows: PERIODS } });
        if (arg === "exp") {
          if (!canWrite) return say({ text: "🔒 Nível Básico: registro de despesas bloqueado.", buttons: [MENU] });
          const d = await data();
          return vehicleList(d.vehicles.filter((v) => v.status !== "sold"), "exp_v:", "💸 *Registrar despesa*\nPasso 1: escolha o veículo.", [{ id: "exp_v:general", title: "🏢 Despesa geral", description: "Sem veículo" }]);
        }
        if (arg === "mnt") return say({ text: "🔧 *Manutenções*", buttons: [{ id: "mnt:open", title: "⚠️ Alertas e abertas" }, ...(canWrite ? [{ id: "mnt:new", title: "➕ Nova manutenção" }] : []), MENU] });
        if (arg === "fleet") return say({ text: "🚗 *Frota e Locações*", buttons: [{ id: "fleet:available", title: "✅ Disponíveis" }, { id: "fleet:rented", title: "🔑 Alugados" }, { id: "fleet:maintenance", title: "🔧 Em manutenção" }] });
        if (arg === "clients") { next = { step: "clients:search", data: {} }; return say({ text: "👥 Digite nome, telefone ou CPF do cliente:", buttons: [MENU] }); }
        return menu();
      case "ch":
        if (arg === "today") return receiptsList("today", `📅 *Vencendo hoje (${formatDate(today)})*`);
        if (arg === "late") return receiptsList("late", "🚨 *Em atraso*");
        next = { step: "ch:search", data: {} };
        return say({ text: "🔍 Digite o nome do cliente ou a placa:", buttons: [MENU] });
      case "pay": {
        const o = await findOpen(arg);
        if (!o) return say({ text: "Parcela não está mais em aberto.", buttons: [MENU] });
        const c = o.client;
        return say({
          text: `🧾 *Parcela*\nLocatário: ${c?.name ?? "—"}${c?.phone ? ` · ${c.phone}` : ""}\nVeículo: ${vLabel(o.vehicle)}\nVencimento: ${formatDate(o.due)}${o.days ? ` (${o.days} dia(s) de atraso)` : ""}\nValor: ${formatCurrency(o.amount)}${o.total !== o.amount ? `\nAtualizado (multa/juros): ${formatCurrency(o.total)}` : ""}`,
          buttons: canWrite
            ? [{ id: `settle_full:${arg}`, title: "✅ Baixa integral" }, { id: `settle_custom:${arg}`, title: "✏️ Outro valor" }, { id: `notify_client:${arg}`, title: "📲 Enviar cobrança" }]
            : [{ id: `notify_client:${arg}`, title: "📲 Enviar cobrança" }, MENU],
        });
      }
      case "settle_full": { const o = await findOpen(arg); return o ? settleCard(o, o.total) : say({ text: "Parcela não está mais em aberto.", buttons: [MENU] }); }
      case "settle_custom":
        if (!canWrite) return say({ text: "🔒 Nível Básico: baixa bloqueada.", buttons: [MENU] });
        next = { step: "settle_custom", data: { ref: arg } };
        return say({ text: "✏️ Digite o valor recebido (ex.: 350 ou 350,50):", buttons: [MENU] });
      case "notify_client": {
        const [r, rc] = arg.split("|");
        return say({ text: await ports.notifyClient(r, rc), buttons: [MENU] });
      }
      case "fin": return report(arg as DatePresetKey);
      case "exp_v":
        next = { step: "exp_cat", data: { vehicleId: arg === "general" ? null : arg } };
        return say({ text: "Passo 2: escolha a categoria.", list: { button: "Categoria", rows: CATEGORIES } });
      case "exp_c":
        next = { step: "exp_amount", data: { ...session.data, category: arg } };
        return say({ text: "Passo 3: digite o valor e a descrição.\nEx.: *180 Pneu traseiro*", buttons: [MENU] });
      case "mnt":
        if (arg === "open") {
          const d = await data();
          const open = d.maintenance.filter((m) => m.status !== "done").sort((a, b) => a.date.localeCompare(b.date));
          const oil = d.vehicles.map((v) => ({ v, o: vehicle360(v, { ...d, notes: [], contracts: [], emails: [] }, today).oilChange })).filter((x) => x.o.status === "overdue" || x.o.status === "near");
          const lines = [
            ...open.slice(0, 15).map((m) => `• ${d.vehicles.find((v) => v.id === m.vehicleId)?.plate ?? "—"} — ${m.description} (${formatDate(m.date)}${m.date < today ? ", atrasada" : ""})`),
            ...oil.map((x) => `• ${x.v.plate} — troca de óleo ${x.o.status === "overdue" ? "vencida" : "próxima"} (faltam ${formatNumber(x.o.kmUntilNext)} km)`),
          ];
          return say({ text: `⚠️ *Manutenções abertas e alertas*\n\n${lines.length ? lines.join("\n") : "Nenhuma pendência. ✅"}`, buttons: canWrite ? [{ id: "mnt:new", title: "➕ Nova manutenção" }, MENU] : [MENU] });
        }
        if (!canWrite) return say({ text: "🔒 Nível Básico: lançamento bloqueado.", buttons: [MENU] });
        return vehicleList((await data()).vehicles.filter((v) => v.status !== "sold"), "mnt_v:", "➕ *Nova manutenção*\nEscolha o veículo.");
      case "mnt_v": {
        const v = (await data()).vehicles.find((x) => x.id === arg);
        if (!v) return menu();
        next = { step: "mnt_km", data: { vehicleId: v.id } };
        return say({ text: `KM atual de ${v.plate}: ${formatNumber(v.odometer)}.\nDigite o KM da manutenção ou mantenha o atual.`, buttons: [{ id: "mnt_km:keep", title: "Manter KM atual" }, MENU] });
      }
      case "mnt_km":
        next = { step: "mnt_desc", data: { ...session.data, km: null } };
        return say({ text: "Digite o valor e a descrição/peças.\nEx.: *245 Óleo 10W30, filtro e mão de obra*", buttons: [MENU] });
      case "fleet": {
        const d = await data();
        const vs = d.vehicles.filter((v) => v.status === arg);
        if (!vs.length) return say({ text: "Nenhum veículo nesse status.", buttons: [MENU] });
        return vehicleList(vs, "veh:", `🚗 *${VEHICLE_STATUS[arg as FleetVehicle["status"]]?.label ?? arg}* (${vs.length})`);
      }
      case "veh": {
        const d = await data();
        const v = d.vehicles.find((x) => x.id === arg);
        if (!v) return menu();
        const r = d.rentals.find((x) => x.vehicleId === v.id && (x.status === "active" || x.status === "late"));
        const c = r ? d.clients.find((x) => x.id === r.clientId) : undefined;
        return say({ text: `🚗 *${vLabel(v)}*\nStatus: ${VEHICLE_STATUS[v.status]?.label ?? v.status}\nKM atual: ${formatNumber(v.odometer)}${r ? `\n\n🔑 Locatário: ${c?.name ?? "—"}\nValor: ${formatCurrency(billingOf(r).amount)} (${billingOf(r).period === "monthly" ? "mensal" : billingOf(r).period === "weekly" ? "semanal" : billingOf(r).period})\nContrato: ${formatDate(r.startDate)} a ${formatDate(r.endDate)} · ${r.status === "late" ? "em atraso" : "ativo"}` : "\n\nSem locação ativa."}`, buttons: [{ id: "m:fleet", title: "🔙 Frota" }, MENU] });
      }
      case "cli": {
        const d = await data();
        const c = d.clients.find((x) => x.id === arg);
        if (!c) return menu();
        const pend = openReceipts(d, today, "all").filter((o) => o.client?.id === c.id);
        return say({ text: `👤 *${c.name}*\nTelefone: ${c.phone || "—"}\nCNH: ${c.cnhNumber ?? "—"}${c.cnhExpiry ? ` (vence ${formatDate(c.cnhExpiry)})` : ""}\nPendências: ${pend.length ? `${pend.length} parcela(s) · ${formatCurrency(pend.reduce((s, o) => s + o.total, 0))}` : "nenhuma ✅"}`, buttons: pend.length ? [{ id: `pay:${payId(pend[0])}`, title: "💰 Ver parcela" }, MENU] : [MENU] });
      }
      default: return menu();
    }
  }

  // Texto digitado dentro de uma etapa guiada.
  const stepText = async (text: string): Promise<boolean> => {
    const d = session.data;
    if (session.step === "ch:search") { await receiptsList("all", `🔍 *Resultado: ${text}*`, text); return true; }
    if (session.step === "clients:search") {
      const q = norm(text), digits = text.replace(/\D/g, "");
      const found = (await data()).clients.filter((c) => norm(c.name).includes(q) || (digits.length >= 4 && (c.phone.replace(/\D/g, "").includes(digits) || c.cpf.replace(/\D/g, "").includes(digits))));
      if (!found.length) { next = session; say({ text: "Nenhum cliente encontrado. Tente outro nome:", buttons: [MENU] }); return true; }
      say({ text: `👥 ${found.length} cliente(s)`, list: { button: "Ver clientes", rows: found.slice(0, MAX_ROWS).map((c) => ({ id: `cli:${c.id}`, title: c.name.slice(0, 24), description: c.phone })) } });
      return true;
    }
    if (session.step === "settle_custom") {
      const p = parseAmount(text);
      const o = p ? await findOpen(String(d.ref)) : undefined;
      if (!p) { next = session; say({ text: "Valor inválido. Digite só o número, ex.: 350,50", buttons: [MENU] }); return true; }
      if (!o) { say({ text: "Parcela não está mais em aberto.", buttons: [MENU] }); return true; }
      await settleCard(o, p.amount); return true;
    }
    if (session.step === "exp_amount") {
      const p = parseAmount(text);
      if (!p) { next = session; say({ text: "Não entendi. Digite assim: *180 Pneu traseiro*", buttons: [MENU] }); return true; }
      const v = d.vehicleId ? (await data()).vehicles.find((x) => x.id === d.vehicleId) : undefined;
      const description = `${d.category}${p.description ? ` — ${p.description}` : ""}`;
      await confirmCard("create_expense", { vehicleId: v?.id ?? null, amount: p.amount, description, category: d.category }, `💸 *Nova despesa*\nVeículo: ${v ? vLabel(v) : "Geral da locadora"}\nCategoria: ${d.category}\nDescrição: ${p.description || "—"}\nValor: ${formatCurrency(p.amount)}`);
      return true;
    }
    if (session.step === "mnt_km") {
      const km = Number(text.replace(/\D/g, ""));
      if (!km) { next = session; say({ text: "Digite só o número do KM ou toque em Manter KM atual.", buttons: [{ id: "mnt_km:keep", title: "Manter KM atual" }, MENU] }); return true; }
      next = { step: "mnt_desc", data: { ...d, km } };
      say({ text: "Digite o valor e a descrição/peças.\nEx.: *245 Óleo, filtro e mão de obra*", buttons: [MENU] });
      return true;
    }
    if (session.step === "mnt_desc") {
      const p = parseAmount(text);
      const v = (await data()).vehicles.find((x) => x.id === d.vehicleId);
      if (!p || !p.description) { next = session; say({ text: "Digite valor e descrição. Ex.: *245 Troca de óleo*", buttons: [MENU] }); return true; }
      if (!v) { await menu(); return true; }
      await maintenanceCard(v, (d.km as number | null) ?? undefined, p.amount, p.description);
      return true;
    }
    return false;
  };

  if (ev.kind === "action") await route(ev.id);
  else if (ev.kind === "text") {
    if (isMenuCommand(ev.text)) await menu();
    else if (!(await stepText(ev.text))) {
      if (ports.ai && allowed(cfg, "ai_text")) await fromIntent(await ports.ai({ text: ev.text }));
      else say({ text: "Não entendi. Use o menu (ou digite *menu*).", buttons: [MENU] });
    }
  } else if (ev.kind === "audio" || ev.kind === "image" || ev.kind === "document") {
    if (!allowed(cfg, "media") || !ports.ai) say({ text: "🔒 Áudio, foto e PDF exigem o *Nível 3 (Avançado)* no modo Híbrido com IA configurada.", buttons: [MENU] });
    else if (!media) say({ text: "Não consegui baixar o arquivo (máx. 8 MB; PDF, JPG ou PNG). Tente de novo.", buttons: [MENU] });
    else await fromIntent(await ports.ai({ media: { kind: ev.kind, ...media }, text: ev.caption }));
  }

  // Opções numeradas da última resposta ficam na sessão para quem responder digitando o número.
  const last = replies.at(-1);
  next.data = { ...next.data, opts: last ? render(last).options.map((o) => o.id) : [] };
  return { replies, session: next };
}
