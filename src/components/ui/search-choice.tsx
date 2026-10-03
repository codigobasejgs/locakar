"use client";
import { useId, useState } from "react";
import { Input } from "./form";
/** Lista pesquisável: botões nativos mantêm teclado/foco sem biblioteca ou ARIA customizada frágil. */
export function SearchChoice({ label, options, value, disabled, onChange }: { label: string; options: { code: string; name: string }[]; value: string; disabled?: boolean; onChange: (code: string) => void }) {
 const [search, setSearch] = useState(""); const id = useId();
 const list = options.filter(o => o.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
 return <fieldset className="grid min-w-0 gap-2" disabled={disabled}>
  <legend className="text-sm font-semibold">{label}</legend>
  <label className="sr-only" htmlFor={id}>Buscar {label}</label><Input id={id} placeholder={`Buscar ${label.toLowerCase()}`} value={search} onChange={e => setSearch(e.target.value)} />
  <div className="max-h-40 overflow-y-auto rounded-lg border border-line" aria-label={label}>
   {list.length ? list.map(o => <button key={o.code} type="button" aria-pressed={value === o.code} onClick={() => onChange(o.code)} className={`block w-full break-words px-3 py-2 text-left text-xs focus-visible:outline-magenta ${value === o.code ? "bg-magenta/20" : "hover:bg-magenta/5"}`}>{o.name}</button>) : <p className="p-3 text-xs text-muted">Nenhum resultado.</p>}
  </div>
 </fieldset>;
}
