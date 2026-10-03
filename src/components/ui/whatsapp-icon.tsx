/**
 * Ícone colorido do WhatsApp: balão verde (#25D366) com contorno e fone brancos, como no logo oficial.
 * O contorno branco mantém o ícone visível também sobre os botões verdes.
 */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="-1.5 -1.5 27 27" aria-hidden className={className}>
      <path
        fill="#25D366"
        stroke="#FFFFFF"
        strokeWidth={1.6}
        strokeLinejoin="round"
        d="M12.04 0C5.48 0 .15 5.33.15 11.89c0 2.09.55 4.14 1.59 5.95L.05 24l6.31-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89A11.82 11.82 0 0 0 12.04 0z"
      />
      <path
        fill="#FFFFFF"
        d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.78-1.48-1.76-1.65-2.06-.18-.3-.02-.46.13-.6.13-.14.3-.35.45-.53.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.59-.48-.51-.67-.52h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.11.57-.08 1.76-.72 2.01-1.41.24-.7.24-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"
      />
    </svg>
  );
}
