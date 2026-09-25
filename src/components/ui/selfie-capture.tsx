"use client";

import { Camera, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./button";

/**
 * Selfie ao vivo pela câmera frontal (sem opção de galeria), como prova de autoria da assinatura.
 * Devolve JPEG em data URL, reduzido para ~640px (≈40–80 KB).
 * ponytail: prova de presença, não é reconhecimento facial automático; comparar com documento
 * exige provedor de biometria (ex.: Unico, idwall) — integrar quando houver contrato com um.
 */
export function SelfieCapture({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "starting" | "live" | "taken" | "error">("idle");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  useEffect(() => stop, []);

  const start = async () => {
    setState("starting");
    setError("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      video.current!.srcObject = stream.current;
      await video.current!.play();
      setState("live");
    } catch (e) {
      const name = (e as DOMException).name;
      setError(
        name === "NotAllowedError"
          ? "Permita o acesso à câmera no navegador para continuar."
          : name === "NotFoundError"
            ? "Nenhuma câmera encontrada neste aparelho. Use um celular para assinar."
            : "Não foi possível abrir a câmera. Tente em outro navegador.",
      );
      setState("error");
    }
  };

  const take = () => {
    const v = video.current!;
    const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext("2d")!;
    // Espelha para ficar igual ao que a pessoa viu na tela.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.82);
    stop();
    setPhoto(data);
    setState("taken");
    onChange(data);
  };

  const retake = () => {
    setPhoto(null);
    onChange(null);
    start();
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Selfie de confirmação</p>
      <div className="relative grid aspect-[4/3] w-full max-w-sm place-items-center overflow-hidden rounded-xl border border-line bg-black">
        <video ref={video} playsInline muted className={state === "live" || state === "starting" ? "size-full -scale-x-100 object-cover" : "hidden"} />
        {state === "live" && (
          <span className="pointer-events-none absolute inset-[12%_22%] rounded-[50%] border-2 border-dashed border-white/60" aria-hidden />
        )}
        {state === "taken" && photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Sua selfie" className="size-full object-cover" />
        )}
        {(state === "idle" || state === "error") && (
          <div className="p-6 text-center">
            {state === "error" ? (
              <TriangleAlert className="mx-auto size-8 text-amber-300" aria-hidden />
            ) : (
              <Camera className="mx-auto size-8 text-brand-soft" aria-hidden />
            )}
            <p className="mt-2 text-sm text-zinc-300">{state === "error" ? error : "Posicione o rosto de frente, com boa iluminação."}</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {(state === "idle" || state === "error") && (
          <Button type="button" variant="outline" onClick={start}>
            <Camera /> Abrir câmera
          </Button>
        )}
        {state === "live" && (
          <Button type="button" onClick={take}>
            <Camera /> Tirar selfie
          </Button>
        )}
        {state === "taken" && (
          <Button type="button" variant="ghost" onClick={retake}>
            <RefreshCw /> Tirar outra
          </Button>
        )}
      </div>
      <p className="text-xs text-zinc-500">A foto fica guardada apenas com a LOCAKAR, junto ao contrato, como comprovação de que foi você quem assinou.</p>
    </div>
  );
}
