"use client";

import { useEffect, useRef } from "react";

/**
 * Vídeo 3D institucional como camada fixa atrás de toda a Landing.
 * Inicia mudo (política de autoplay). Com prefers-reduced-motion fica pausado no poster.
 * Se o autoplay for bloqueado, o poster (frame real do vídeo) permanece visível.
 */
export function VideoBackground() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (reduce.matches) video.pause();
      else video.play().catch(() => {});
    };
    sync();
    reduce.addEventListener("change", sync);
    return () => reduce.removeEventListener("change", sync);
  }, []);

  return (
    <>
      <video
        ref={ref}
        className="video-background"
        src="/video/locakar-3D.mp4"
        poster="/images/hero-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden
        tabIndex={-1}
        disablePictureInPicture
      />
      <div className="video-overlay" aria-hidden />
      <div className="film-grain" aria-hidden />
    </>
  );
}
