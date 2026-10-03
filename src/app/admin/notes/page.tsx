"use client";

import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { DeleteDialog, FormDialog } from "@/components/admin/crud-dialogs";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useAdminData, useLookups } from "@/hooks/use-admin-data";
import { strOrUndef, useCrud } from "@/hooks/use-crud";
import { newId, parseISODate, todayISO } from "@/lib/utils";
import type { Note } from "@/types";

type Draft = { date: string; time: string; clientId: string; description: string };

const nowTime = () => new Date().toTimeString().slice(0, 5);
const empty = (): Draft => ({ date: todayISO(), time: nowTime(), clientId: "", description: "" });
const toDraft = (n: Note): Draft => ({ date: n.date, time: n.time, clientId: n.clientId ?? "", description: n.description });

const dayLabel = (iso: string) =>
  parseISODate(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

export default function NotesPage() {
  const { data } = useAdminData();
  const { clientName, clientOptions } = useLookups();
  const crud = useCrud("notes", { empty, toDraft, noun: "Anotação" });
  const { bind, draft } = crud;
  const [query, setQuery] = useState("");
  const [client, setClient] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data!.notes
      .filter((n) => (!client || n.clientId === client) && (!q || `${n.description} ${clientName(n.clientId)}`.toLowerCase().includes(q)))
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
    const map = new Map<string, Note[]>();
    list.forEach((n) => map.set(n.date, [...(map.get(n.date) ?? []), n]));
    return [...map.entries()];
  }, [data, query, client, clientName]);

  const submit = () =>
    crud.save({
      id: crud.editing?.id ?? newId(),
      date: draft.date,
      time: draft.time,
      clientId: strOrUndef(draft.clientId),
      description: draft.description.trim(),
    });

  return (
    <>
      <PageHeader
        title="Anotações"
        description="Registro cronológico de ocorrências e combinados."
        actions={
          <Button onClick={crud.openNew}>
            <Plus /> Nova anotação
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar anotações" aria-label="Buscar anotações" className="pl-9" />
        </div>
        <Select value={client} onChange={(e) => setClient(e.target.value)} options={clientOptions} placeholder="Todos os locatários" aria-label="Filtrar por locatário" className="sm:w-64" />
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState title="Nenhuma anotação encontrada" />
        </Card>
      ) : (
        <ol className="relative space-y-8 before:absolute before:bottom-0 before:left-[7px] before:top-2 before:w-px before:bg-gradient-to-b before:from-magenta/60 before:via-line before:to-transparent">
          {groups.map(([date, notes]) => (
            <li key={date} className="relative pl-8">
              <span className="absolute left-0 top-1.5 size-[15px] rounded-full border-2 border-magenta bg-ink shadow-glow-sm" aria-hidden />
              <h2 className="text-sm font-semibold text-zinc-300 first-letter:uppercase">{dayLabel(date)}</h2>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {notes.map((n, i) => (
                  <motion.div key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <Card className="group h-full p-4 transition-colors hover:border-line-strong">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono tabular-nums text-zinc-300">{n.time}</span>
                          {n.clientId && <span className="font-semibold text-brand-soft">{clientName(n.clientId)}</span>}
                        </div>
                        <div className="flex gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <Button variant="ghost" size="icon" className="size-7" aria-label="Editar" onClick={() => crud.openEdit(n)}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-7 hover:!text-red-300" aria-label="Excluir" onClick={() => crud.setDeleting(n)}>
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-zinc-200">{n.description}</p>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}

      <FormDialog open={crud.formOpen} onOpenChange={crud.setFormOpen} title={crud.editing ? "Editar anotação" : "Nova anotação"} onSubmit={submit}>
        <Field label="Data" htmlFor="f-date" required>
          <Input {...bind("date")} type="date" required />
        </Field>
        <Field label="Horário" htmlFor="f-time" required>
          <Input {...bind("time")} type="time" required />
        </Field>
        <Field label="Locatário" htmlFor="f-clientId" className="sm:col-span-2">
          <Select {...bind("clientId")} options={clientOptions} placeholder="Nenhum (anotação geral)" />
        </Field>
        <Field label="Descrição" htmlFor="f-description" required className="sm:col-span-2">
          <Textarea {...bind("description")} required rows={5} />
        </Field>
      </FormDialog>

      <DeleteDialog open={!!crud.deleting} onCancel={() => crud.setDeleting(null)} onConfirm={crud.confirmDelete} what="esta anotação" />
    </>
  );
}
