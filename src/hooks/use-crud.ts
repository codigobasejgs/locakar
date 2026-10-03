"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAdminData } from "./use-admin-data";
import type { CollectionKey, EntityFor } from "@/repositories/types";

/**
 * Estado padrão de uma tela CRUD: formulário (novo/editar), visualização e exclusão.
 * `toDraft` converte a entidade em rascunho de formulário (strings para inputs).
 */
export function useCrud<K extends CollectionKey, D>(
  key: K,
  opts: { empty: () => D; toDraft: (item: EntityFor<K>) => D; noun: string },
) {
  const { create, update, remove } = useAdminData();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EntityFor<K> | null>(null);
  const [draft, setDraft] = useState<D>(opts.empty);
  const [viewing, setViewing] = useState<EntityFor<K> | null>(null);
  const [deleting, setDeleting] = useState<EntityFor<K> | null>(null);

  const set = <F extends keyof D>(field: F, value: D[F]) => setDraft((prev) => ({ ...prev, [field]: value }));

  /** Liga um input/select/textarea de string ao campo do rascunho. */
  const bind = <F extends keyof D>(field: F, transform?: (v: string) => string) => ({
    id: `f-${String(field)}`,
    name: String(field),
    value: (draft[field] ?? "") as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      set(field, (transform ? transform(e.target.value) : e.target.value) as D[F]),
  });

  return {
    draft,
    set,
    bind,
    formOpen,
    editing,
    viewing,
    deleting,
    setFormOpen,
    setViewing,
    setDeleting,
    openNew() {
      setEditing(null);
      setDraft(opts.empty());
      setFormOpen(true);
    },
    openEdit(item: EntityFor<K>) {
      setViewing(null);
      setEditing(item);
      setDraft(opts.toDraft(item));
      setFormOpen(true);
    },
    /** Persiste `entity` (create ou update conforme o modo) e fecha o formulário. */
    async save(entity: EntityFor<K>) {
      const ok = editing ? await update(key, editing.id, entity) : await create(key, entity);
      if (ok) {
        toast.success(editing ? `${opts.noun} atualizado(a).` : `${opts.noun} cadastrado(a).`);
        setFormOpen(false);
      }
      return ok;
    },
    async confirmDelete() {
      if (deleting && (await remove(key, deleting.id))) toast.success(`${opts.noun} excluído(a).`);
      setDeleting(null);
    },
  };
}

export const numOrUndef = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));
export const strOrUndef = (v: string) => (v.trim() === "" ? undefined : v.trim());
export const numToStr = (v?: number) => (v == null ? "" : String(v));
