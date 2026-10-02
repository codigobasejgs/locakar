import Image from "next/image";
import { cn } from "@/lib/utils";

/** Captura real do sistema. Com `themed`, mostra a versão clara ou escura conforme o tema da página. */
export function Shot({
  name,
  alt,
  width,
  height,
  sizes,
  themed = false,
  eager = false,
  className,
}: {
  name: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  themed?: boolean;
  eager?: boolean;
  className?: string;
}) {
  const common = { width, height, sizes, className: cn("block h-auto w-full", className) };
  if (!themed) {
    return <Image alt={alt} src={`/plataforma/${name}.webp`} {...common} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : undefined} />;
  }
  // A versão oculta (display:none) não é baixada com loading="lazy"; no hero, fetchPriority prioriza a visível (docs next/image).
  return (
    <>
      <Image alt={alt} src={`/plataforma/${name}-light.webp`} {...common} className={cn(common.className, "pl-light-only")} loading="lazy" fetchPriority={eager ? "high" : undefined} />
      <Image alt={alt} src={`/plataforma/${name}-dark.webp`} {...common} className={cn(common.className, "pl-dark-only")} loading="lazy" fetchPriority={eager ? "high" : undefined} />
    </>
  );
}

export function Laptop({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-full", className)}>
      <div className="pl-laptop-screen">
        <div className="overflow-hidden rounded-md">{children}</div>
      </div>
      <div className="pl-laptop-base" aria-hidden="true" />
    </div>
  );
}

export function Phone({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("pl-phone pl-shadow", className)}>
      <div>{children}</div>
    </div>
  );
}

/** Janela de navegador simples para telas do painel fora do notebook. */
export function BrowserFrame({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <figure className={cn("pl-surface pl-shadow overflow-hidden rounded-xl border pl-line", className)}>
      <div className="flex items-center gap-1.5 border-b pl-line px-3 py-2" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-[#ef4444]/70" />
        <span className="size-2.5 rounded-full bg-[#f59e0b]/70" />
        <span className="size-2.5 rounded-full bg-[#22c55e]/70" />
        {label && <span className="pl-muted ml-2 truncate text-[11px]">{label}</span>}
      </div>
      {children}
    </figure>
  );
}
