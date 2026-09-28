/**
 * Cobranças: periodicidade, datas, multa/juros por atraso e PIX "copia e cola" (BR Code).
 * Puro, sem I/O — testado em scripts/check.ts.
 */
import type { BillingConfig, BillingPeriod, InterestPeriod, PixKeyType, PixSettings, Receipt, Rental } from "@/types";
import { addDays, daysBetween, isValidCPF, parseISODate, toISODate } from "./utils";

export const PERIOD_LABEL: Record<BillingPeriod, string> = {
  daily: "Diária",
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

/** Rótulo de cada parcela ("Semana 3", "Mês 2"...). */
export const PERIOD_UNIT: Record<BillingPeriod, string> = {
  daily: "Dia",
  weekly: "Semana",
  biweekly: "Quinzena",
  monthly: "Mês",
  quarterly: "Trimestre",
  semiannual: "Semestre",
  annual: "Ano",
};

export const INTEREST_LABEL: Record<InterestPeriod, string> = { daily: "ao dia", weekly: "por semana", monthly: "ao mês" };

const MONTHS: Partial<Record<BillingPeriod, number>> = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };
const DAYS: Partial<Record<BillingPeriod, number>> = { daily: 1, weekly: 7, biweekly: 15 };

/** Soma meses mantendo o dia; em mês mais curto usa o último dia (31/01 + 1 mês = 28/02). */
export function addMonths(iso: string, months: number, anchorDay = parseISODate(iso).getDate()) {
  const d = parseISODate(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(anchorDay, last));
  return toISODate(target);
}

/** n-ésima data de cobrança (n = 0 é a primeira), sempre calculada a partir da primeira: sem desvio de fim de mês. */
export const dueAt = (firstDue: string, period: BillingPeriod, n: number) =>
  MONTHS[period] ? addMonths(firstDue, MONTHS[period]! * n) : addDays(firstDue, DAYS[period]! * n);

/**
 * Parcelas de `firstDue` até `until` (inclusive), no máximo 400.
 * Mensais/trimestrais/anuais mantêm o dia do mês da primeira cobrança.
 */
export function buildReceipts(args: { id: string; firstDue: string; until: string; amount: number; period: BillingPeriod }): Receipt[] {
  const out: Receipt[] = [];
  for (let n = 0; n < 400; n++) {
    const due = dueAt(args.firstDue, args.period, n);
    if (due > args.until) break;
    out.push({ id: `${args.id}-r${n + 1}`, dueDate: due, amount: args.amount, paid: false });
  }
  return out;
}

/** Regras de cobrança da locação (locações antigas: semanal, sem juros, sem envio automático). */
export function billingOf(rental: Pick<Rental, "billing" | "weeklyRate" | "receipts" | "startDate" | "endDate">): BillingConfig {
  return (
    rental.billing ?? {
      period: "weekly",
      amount: rental.weeklyRate,
      firstDue: rental.receipts[0]?.dueDate ?? rental.startDate,
      until: rental.endDate,
      lateFeePercent: 0,
      interestPercent: 0,
      interestPeriod: "daily",
      graceDays: 0,
      autoSend: false,
      remindDaysBefore: 1,
    }
  );
}

/** Valor atualizado de uma parcela vencida: multa fixa (%) + juros simples por dia/semana/mês de atraso. */
export function lateCharges(amount: number, dueDate: string, today: string, cfg: Pick<BillingConfig, "graceDays" | "lateFeePercent" | "interestPercent" | "interestPeriod">) {
  const days = daysBetween(dueDate, today);
  if (days <= (cfg.graceDays ?? 0)) return { days: Math.max(0, days), fee: 0, interest: 0, total: amount };
  const periods = cfg.interestPeriod === "daily" ? days : cfg.interestPeriod === "weekly" ? Math.floor(days / 7) : Math.floor(days / 30);
  const round = (v: number) => Math.round(v * 100) / 100;
  const fee = round((amount * (cfg.lateFeePercent ?? 0)) / 100);
  const interest = round((amount * (cfg.interestPercent ?? 0) * periods) / 100);
  return { days, fee, interest, total: round(amount + fee + interest) };
}

/* ---------- PIX (BR Code / EMV-MPM, manual do Banco Central) ---------- */

const tlv = (id: string, value: string) => `${id}${String(value.length).padStart(2, "0")}${value}`;

/** CRC16-CCITT (polinômio 0x1021, inicial 0xFFFF), exigido no campo 63 do BR Code. */
export function crc16(payload: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acentos e caracteres fora do padrão (nome e cidade do recebedor aceitam só ASCII). */
const ascii = (s: string, max: number) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();

export const PIX_KEY_LABEL: Record<PixKeyType, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  phone: "Celular",
  email: "E-mail",
  random: "Chave aleatória",
};

/**
 * Chave no formato exigido pelo Banco Central, conforme o tipo informado pelo admin
 * (celular e CPF têm 11 dígitos: sem o tipo não dá para saber qual é).
 * Retorna null se a chave não for válida para o tipo.
 */
export function normalizePixKey(key: string, type: PixKeyType): string | null {
  const k = key.trim();
  const digits = k.replace(/\D/g, "");
  switch (type) {
    case "cpf":
      return isValidCPF(digits) ? digits : null;
    case "cnpj":
      return digits.length === 14 && !/^(\d)\1{13}$/.test(digits) ? digits : null;
    case "phone": {
      const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
      return national.length === 10 || national.length === 11 ? `+55${national}` : null;
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(k) && k.length <= 77 ? k.toLowerCase() : null;
    case "random":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k) ? k.toLowerCase() : null;
  }
}

/**
 * PIX "copia e cola" estático com valor (BR Code, EMV-MPM), lido por qualquer app de banco.
 * Campos: 00 formato · 26 conta PIX (GUI + chave) · 52 categoria · 53 moeda BRL · 54 valor ·
 * 58 país · 59 nome · 60 cidade · 62/05 txid · 63 CRC16. Sem descrição (campo 02): alguns bancos recusam.
 */
export function pixPayload(pix: Pick<PixSettings, "key" | "keyType" | "name" | "city">, amount: number, txid = "***") {
  const key = normalizePixKey(pix.key, pix.keyType);
  if (!key) throw new Error("Chave PIX inválida para o tipo selecionado.");
  const id = txid === "***" ? "***" : txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const body =
    tlv("00", "01") +
    tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", key)) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (amount > 0 ? tlv("54", amount.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", ascii(pix.name, 25) || "LOCAKAR") +
    tlv("60", ascii(pix.city, 15) || "BRASIL") +
    tlv("62", tlv("05", id)) +
    "6304";
  return body + crc16(body);
}

export const isPixReady = (pix?: PixSettings) => Boolean(pix && normalizePixKey(pix.key, pix.keyType) && pix.name.trim() && pix.city.trim());

/** Parcelas que o cron cobra hoje: N dias antes, no dia do vencimento e, atrasadas, a cada 3 dias. */
export function receiptsToCharge(rental: Pick<Rental, "billing" | "weeklyRate" | "receipts" | "startDate" | "endDate" | "status">, today: string) {
  const billing = billingOf(rental);
  if (!billing.autoSend || rental.status === "cancelled" || rental.status === "finished") return [];
  return rental.receipts.filter((r) => {
    if (r.paid) return false;
    const d = daysBetween(today, r.dueDate);
    return d === billing.remindDaysBefore || d === 0 || (d < 0 && -d % 3 === 0);
  });
}

/**
 * Cobrança de uma parcela no dia: valor atualizado (multa/juros) e PIX copia e cola.
 * Fonte única para e-mail/WhatsApp (lib/server/charge.ts) e para o App do Locatário (/api/tenant).
 */
export function chargeFor(
  rental: Pick<Rental, "id" | "billing" | "weeklyRate" | "receipts" | "startDate" | "endDate">,
  receiptId: string,
  pix: PixSettings,
  today: string,
) {
  const billing = billingOf(rental);
  const index = rental.receipts.findIndex((r) => r.id === receiptId) + 1;
  const receipt = rental.receipts[index - 1];
  if (!receipt) return null;
  const late = !receipt.paid && receipt.dueDate < today;
  const charges = late ? lateCharges(receipt.amount, receipt.dueDate, today, billing) : { days: 0, fee: 0, interest: 0, total: receipt.amount };
  // txid: identifica a parcela no extrato do banco (até 25 caracteres alfanuméricos).
  const txid = `LKR${rental.id.replace(/-/g, "").slice(0, 10)}${String(index).padStart(3, "0")}`.toUpperCase();
  return {
    index,
    label: `${PERIOD_UNIT[billing.period]} ${index}`,
    receipt,
    late,
    ...charges,
    txid,
    code: isPixReady(pix) ? pixPayload(pix, charges.total, txid) : null,
  };
}
