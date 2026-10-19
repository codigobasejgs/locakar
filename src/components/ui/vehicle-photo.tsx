"use client";
import Image from "next/image";
import { CarFront } from "lucide-react";
import { useState } from "react";

/** Falha não vira ícone de imagem quebrada; novo src recebe uma nova tentativa. */
export function VehiclePhoto({ src, alt, sizes = "64px", className = "object-contain p-1" }: { src?: string; alt: string; sizes?: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return !src || failedSrc === src ? <div role="img" aria-label={alt} className="flex size-full items-center justify-center bg-surface text-muted"><CarFront className="size-6" aria-hidden /></div> : <Image src={src} alt={alt} fill sizes={sizes} className={className} onError={() => setFailedSrc(src)} />;
}
