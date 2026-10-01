"use client";

import { record, type Json } from "@/lib/selsyn";
const label = (s: string) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").replace(/^./, c => c.toUpperCase());
const scalar = (v: Json): string => v === null ? "Não informado" : typeof v === "boolean" ? v ? "Sim" : "Não" : typeof v === "number" ? v.toLocaleString("pt-BR") : typeof v === "string" ? v || "Não informado" : "Informações adicionais";

/** Apresentação estruturada de conteúdo oficial não tipado: sem HTML/JS do fornecedor. */
export function SelsynResult({ value, depth = 0 }: { value: Json; depth?: number }) {
  if (depth > 8) return <p className="text-sm text-muted">Conteúdo profundo disponível na resposta técnica.</p>;
  if (value === null || typeof value !== "object") return <p className="break-words text-sm">{scalar(value)}</p>;
  if (Array.isArray(value)) {
    if (!value.length) return <p className="text-sm text-muted">Nenhum resultado encontrado.</p>;
    const objects = value.every(v => v && typeof v === "object" && !Array.isArray(v));
    const keys = objects ? [...new Set(value.flatMap(v => Object.keys(record(v))))].filter(k => value.every(v => record(v)[k] === undefined || typeof record(v)[k] !== "object" || record(v)[k] === null)) : [];
    return <div className="grid gap-3">
      <p className="text-xs text-muted">{value.length} registro(s) retornado(s){value.length > 300 ? " — exibindo os primeiros 300" : ""}.</p>
      {keys.length ? <div className="max-h-[500px] overflow-auto rounded-lg border border-line"><table className="w-full text-left text-xs"><thead className="bg-surface"><tr>{keys.map(k => <th key={k} className="whitespace-nowrap p-3">{label(k)}</th>)}</tr></thead><tbody>{value.slice(0, 300).map((v, i) => <tr key={i} className="border-t border-line">{keys.map(k => <td key={k} className="max-w-xs break-words p-3">{scalar(record(v)[k] ?? null)}</td>)}</tr>)}</tbody></table></div> : null}
      {!keys.length ? value.slice(0, 300).map((v, i) => <div key={i} className="rounded-lg border border-line p-3"><SelsynResult value={v} depth={depth + 1} /></div>) : value.slice(0, 300).map((v, i) => {
        const nested = Object.fromEntries(Object.entries(record(v)).filter(([k, v]) => !keys.includes(k) && v !== null));
        return Object.keys(nested).length ? <details key={i} className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-xs">Detalhes do registro {i + 1}</summary><SelsynResult value={nested} depth={depth + 1} /></details> : null;
      })}
    </div>;
  }
  const entries = Object.entries(value);
  if (!entries.length) return <p className="text-sm text-muted">Não informado.</p>;
  return <div className="grid gap-4">{entries.map(([k, v]) => <div key={k} className="min-w-0"><p className="mb-1 text-xs font-semibold text-muted">{label(k)}</p><SelsynResult value={v} depth={depth + 1} /></div>)}</div>;
}
