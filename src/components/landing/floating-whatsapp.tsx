"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { WHATSAPP_MESSAGES } from "@/lib/company";
import { ROUTES } from "@/lib/constants";
import { getWhatsAppUrl } from "@/lib/whatsapp";

export function FloatingWhatsApp() {
  return (
    <motion.a
      href={getWhatsAppUrl(WHATSAPP_MESSAGES.availability)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Fale com a LOCAKAR pelo WhatsApp"
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 1.4, type: "spring", stiffness: 220, damping: 18 }}
      className="group fixed bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] right-[max(1rem,env(safe-area-inset-right))] z-50 grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/40 transition-transform hover:scale-105 focus-visible:scale-105 animate-soft-pulse sm:right-6"
    >
      <WhatsAppIcon className="size-7" />
      <span
        role="tooltip"
        className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-lg border border-white/10 bg-ink/90 px-3 py-1.5 text-xs font-medium text-white opacity-0 backdrop-blur transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 sm:block"
      >
        Fale com a LOCAKAR
      </span>
    </motion.a>
  );
}

/** Ctrl + Shift + A → /admin. Conveniência, não segurança. */
export function AdminShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        // Navegação completa: /admin passa pelo proxy de login (redirect de servidor).
        window.location.assign(ROUTES.admin);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
