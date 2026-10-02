import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Central de Ajuda e Treinamento",
  description: "Manuais, tutoriais passo a passo e treinamentos da locadora.",
};

// O contexto da ajuda (perfil, progresso) vem do AdminHelpProvider do shell do painel.
export default function AdminHelpLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl py-2 px-1 sm:px-4">{children}</div>;
}
