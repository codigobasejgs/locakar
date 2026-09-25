import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo oficial. `light` = versão do arquivo original com fundo removido e letras pretas em branco
 * (para fundos escuros, como no vídeo institucional). `circular` = selo circular.
 */
export function Logo({
  variant = "light",
  className,
  priority,
}: {
  variant?: "light" | "original" | "circular";
  className?: string;
  priority?: boolean;
}) {
  if (variant === "circular") {
    return (
      <Image
        src="/logos/locakar-circular.png"
        alt="Selo LOCAKAR — Locadora, aluguel de carros"
        width={400}
        height={400}
        priority={priority}
        className={cn("h-auto", className)}
      />
    );
  }
  return (
    <Image
      src={variant === "light" ? "/logos/locakar-logo-light.png" : "/logos/locakar-logo.png"}
      alt="LOCAKAR — Locadora de Veículos"
      width={319}
      height={165}
      priority={priority}
      className={cn("h-auto", className)}
    />
  );
}
