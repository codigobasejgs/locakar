import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ---------- Formatação ---------- */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const compactBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatCurrency = (value?: number) => (value == null ? "—" : brl.format(value));
export const formatCompactCurrency = (value: number) => compactBrl.format(value);
export const formatNumber = (value?: number) => (value == null ? "—" : value.toLocaleString("pt-BR"));

export function formatDate(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/* ---------- Datas (ISO YYYY-MM-DD, fuso local) ---------- */

const pad = (n: number) => String(n).padStart(2, "0");

export const toISODate = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayISO = () => toISODate(new Date());

/** Data de hoje no fuso de São Paulo (o servidor da Vercel roda em UTC). */
export const todaySP = () => toISODate(new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })));

export function parseISODate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export const daysBetween = (from: string, to: string) =>
  Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);

export const monthKey = (iso: string) => iso.slice(0, 7);

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}/${String(y).slice(2)}`;
}

/** Últimos `count` meses (chaves YYYY-MM) terminando no mês de `ref`. */
export function lastMonths(count: number, ref = todayISO()) {
  const [y, m] = ref.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - (count - 1 - i), 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  });
}

/* ---------- Máscaras e validação ---------- */

export const onlyDigits = (value: string) => value.replace(/\D/g, "");

export function maskCPF(value: string) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone brasileiro → número internacional sem símbolos (5519999999999). */
export function toWhatsAppNumber(phone?: string) {
  const d = onlyDigits(phone ?? "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

export const maskPlate = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). */
export const isValidPlate = (plate: string) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate);

/** Oculta o CPF para listagens: ***.456.789-** */
export function hideCPF(cpf: string) {
  const d = onlyDigits(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "—";
}

/** Calcula os dois dígitos verificadores de um CPF a partir dos 9 primeiros dígitos. */
export function cpfCheckDigits(base9: string) {
  const digit = (nums: string) => {
    const sum = [...nums].reduce((acc, n, i) => acc + Number(n) * (nums.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const first = digit(base9);
  return `${first}${digit(base9 + first)}`;
}

export function isValidCPF(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  return cpfCheckDigits(d.slice(0, 9)) === d.slice(9);
}

export function maskCNPJ(value: string) {
  return onlyDigits(value)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function isValidCNPJ(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (slice: string, weights: number[]) => {
    const sum = [...slice].reduce((acc, digit, idx) => acc + Number(digit) * weights[idx], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const d1 = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${d1}${d2}` === d.slice(12);
}

export const maskDoc = (v: string, type: "cpf" | "cnpj" = "cpf") => (type === "cnpj" ? maskCNPJ(v) : maskCPF(v));
export const isValidDoc = (v: string, type: "cpf" | "cnpj" = "cpf") => (type === "cnpj" ? isValidCNPJ(v) : isValidCPF(v));

export function hideDoc(doc: string, type: "cpf" | "cnpj" = "cpf") {
  const d = onlyDigits(doc);
  if (type === "cnpj") {
    return d.length === 14 ? `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-**` : "—";
  }
  return hideCPF(doc);
}

export function maskCEP(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
