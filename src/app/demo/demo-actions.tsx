"use client";

import { LayoutDashboard, Smartphone } from "lucide-react";
import { enterDemo } from "@/lib/demo";

/** Entra na locadora fictícia: painel (admin) ou app do locatário. Nada vai para o banco. */
export function DemoActions({ slug }: { slug: string }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => enterDemo(slug, "/admin")} className="fe-btn fe-btn-primary w-full">
        <LayoutDashboard className="size-4" aria-hidden="true" /> Entrar como admin
      </button>
      <button type="button" onClick={() => enterDemo(slug, `/locatario?org=${slug}`)} className="fe-btn fe-btn-ghost w-full">
        <Smartphone className="size-4" aria-hidden="true" /> App do locatário
      </button>
    </div>
  );
}
