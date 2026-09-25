"use client";

import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Campo de assinatura (mouse, dedo ou caneta) com Pointer Events. Devolve PNG em data URL,
 * com traço preto sobre fundo transparente (fica legível no documento impresso).
 */
export function SignaturePad({
  onChange,
  label = "Assine no quadro abaixo",
  className,
}: {
  onChange: (dataUrl: string | null) => void;
  label?: string;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Resolução real do canvas acompanha o tamanho na tela (nitidez em telas retina).
  useEffect(() => {
    const el = canvas.current!;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      const { width, height } = el.getBoundingClientRect();
      el.width = Math.round(width * ratio);
      el.height = Math.round(height * ratio);
      const ctx = el.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = "#111";
      setEmpty(true);
      onChange(null);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // onChange estável o bastante para o ciclo de vida do canvas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (!empty) onChange(canvas.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const el = canvas.current!;
    el.getContext("2d")!.clearRect(0, 0, el.width, el.height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
        <span>{label}</span>
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 normal-case text-brand-soft hover:underline" disabled={empty}>
          <Eraser className="size-3.5" aria-hidden /> Limpar
        </button>
      </div>
      <div className="relative rounded-xl bg-white">
        <canvas
          ref={canvas}
          aria-label={label}
          role="img"
          className="block h-40 w-full cursor-crosshair touch-none rounded-xl"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
        />
        {empty && <span className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-sm text-zinc-400">Assine aqui</span>}
        <span className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-zinc-300" aria-hidden />
      </div>
    </div>
  );
}
