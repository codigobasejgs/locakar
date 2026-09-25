"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";

/** Modal de formulário padrão (submit nativo → validação HTML5 + Enter para salvar). */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  children,
  submitLabel = "Salvar",
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onSubmit: () => void;
  children: React.ReactNode;
  submitLabel?: string;
  size?: "sm" | "md" | "lg";
}) {
  const formId = `form-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form={formId}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate={false}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        {children}
      </form>
    </Dialog>
  );
}

export function DeleteDialog({
  open,
  onCancel,
  onConfirm,
  what,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  what: string;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title="Confirmar exclusão"
      description={`Excluir ${what}? Esta ação não pode ser desfeita.`}
      onConfirm={onConfirm}
    />
  );
}
