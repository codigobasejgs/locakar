"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye, Pencil, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, type Option } from "@/components/ui/form";
import { useAdminData } from "@/hooks/use-admin-data";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Valor usado para ordenação; sem ele a coluna não é ordenável. */
  sortValue?: (row: T) => string | number | undefined;
  className?: string;
}

export interface Filter<T> {
  key: string;
  label: string;
  options: Option[];
  predicate: (row: T, value: string) => boolean;
}

interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchText?: (row: T) => string;
  filters?: Filter<T>[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  onView?: (row: T) => void;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  toolbar?: React.ReactNode;
  emptyTitle?: string;
  label: string;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchPlaceholder = "Buscar...",
  searchText,
  filters = [],
  initialSort,
  onView,
  onEdit,
  onDelete,
  toolbar,
  emptyTitle = "Nenhum registro encontrado",
  label,
}: DataTableProps<T>) {
  const { settings } = useAdminData();
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(1);
  const pageSize = settings.pageSize;

  const processed = useMemo(() => {
    const q = normalize(query.trim());
    let list = rows.filter(
      (row) =>
        (!q || !searchText || normalize(searchText(row)).includes(q)) &&
        filters.every((f) => !filterValues[f.key] || f.predicate(row, filterValues[f.key])),
    );
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col?.sortValue) {
      const dir = sort!.dir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const va = col.sortValue!(a);
        const vb = col.sortValue!(b);
        if (va == null) return 1;
        if (vb == null) return -1;
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR")) * dir;
      });
    }
    return list;
  }, [rows, query, filterValues, filters, searchText, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const current = Math.min(page, totalPages);
  const visible = processed.slice((current - 1) * pageSize, current * pageSize);
  const hasActions = onView || onEdit || onDelete;

  const toggleSort = (key: string) => {
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
        {searchText && (
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-9"
            />
          </div>
        )}
        {filters.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            {filters.map((f) => (
              <Select
                key={f.key}
                aria-label={f.label}
                value={filterValues[f.key] ?? ""}
                onChange={(e) => {
                  setFilterValues((prev) => ({ ...prev, [f.key]: e.target.value }));
                  setPage(1);
                }}
                options={f.options}
                placeholder={f.label}
                className="sm:w-44"
              />
            ))}
          </div>
        )}
        {toolbar && <div className="flex flex-wrap gap-2 lg:ml-auto">{toolbar}</div>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm" aria-label={label}>
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-zinc-500">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn("whitespace-nowrap px-4 py-3 font-semibold", col.className)}
                  aria-sort={sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1.5 uppercase hover:text-zinc-200"
                    >
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
              {hasActions && (
                <th scope="col" className="sticky right-0 bg-panel px-4 py-3 text-right font-semibold">
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-line/60 transition-colors last:border-0 hover:bg-white/[0.025]",
                  onView && "cursor-pointer",
                )}
                onClick={onView ? () => onView(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 text-zinc-200", settings.compactTables ? "py-2" : "py-3.5", col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
                {hasActions && (
                  <td className="sticky right-0 bg-panel px-4 py-2 text-right shadow-[-12px_0_12px_-12px_rgb(0_0_0/0.8)]" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex gap-0.5">
                      {onView && (
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Visualizar" onClick={() => onView(row)}>
                          <Eye />
                        </Button>
                      )}
                      {onEdit && (
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Editar" onClick={() => onEdit(row)}>
                          <Pencil />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 hover:!text-red-300"
                          aria-label="Excluir"
                          onClick={() => onDelete(row)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <EmptyState title={emptyTitle} description="Ajuste a busca ou os filtros." />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
        <p>
          {processed.length === 0
            ? "0 registros"
            : `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, processed.length)} de ${processed.length} registros`}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" aria-label="Página anterior" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            <ChevronLeft />
          </Button>
          <span className="px-2 tabular-nums">
            {current} / {totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Próxima página"
            disabled={current >= totalPages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </Card>
  );
}
