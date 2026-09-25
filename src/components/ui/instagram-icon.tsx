import { useId } from "react";

/** Ícone oficial do Instagram, colorido (gradiente amarelo → laranja → rosa → roxo) com a câmera em branco. */
export function InstagramIcon({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <defs>
        <radialGradient id={`ig-a-${id}`} cx="6.4" cy="25.8" r="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFDD55" />
          <stop offset="0.1" stopColor="#FFDD55" />
          <stop offset="0.5" stopColor="#FF543E" />
          <stop offset="1" stopColor="#C837AB" />
        </radialGradient>
        <radialGradient id={`ig-b-${id}`} cx="-4" cy="1.7" r="10.7" gradientTransform="matrix(.2 1 -4.1 .8 3.7 -3.6)" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3771C8" />
          <stop offset="0.13" stopColor="#3771C8" />
          <stop offset="1" stopColor="#6600FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#ig-a-${id})`} />
      <rect width="24" height="24" rx="6" fill={`url(#ig-b-${id})`} />
      <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#FFFFFF" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.4" fill="none" stroke="#FFFFFF" strokeWidth="1.7" />
      <circle cx="16.3" cy="7.7" r="1" fill="#FFFFFF" />
    </svg>
  );
}
