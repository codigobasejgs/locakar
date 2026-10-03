"use client";

import { ArrowRight } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { WHATSAPP_MESSAGES } from "@/lib/company";
import { getWhatsAppUrl } from "@/lib/whatsapp";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, 80]);
  const cueOpacity = useTransform(scrollY, [0, 200], [1, 0]);

  return (
    <section id="inicio" aria-labelledby="hero-title" className="relative flex min-h-svh items-center">
      {/* Opacidade 100% permanente durante o scroll — elimina o problema de texto transparente/lavado */}
      <motion.div style={{ y }} className="mx-auto w-full max-w-7xl px-4 pb-24 pt-28 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, ease }}
          >
            {/* Logo redondo oficial da LOCAKAR */}
            <Logo variant="circular" priority className="w-28 drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)] sm:w-32 lg:w-[150px]" />
          </motion.div>

          <motion.h1
            id="hero-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease }}
            className="mt-7 font-display text-3xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl lg:text-6xl sm:mt-8"
          >
            Seu nome não define seu trabalho.{" "}
            <span className="text-gradient-brand sm:block">Alugue mesmo negativado!</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.35, ease }}
            className="mt-5 max-w-[650px] text-base text-pretty text-zinc-300 sm:mt-6 sm:text-lg"
          >
            Mobilidade, praticidade e atendimento personalizado para você seguir o seu caminho.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.5, ease }}
            className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:mt-10 sm:w-auto sm:flex-row"
          >
            <Button asChild size="lg" className="group">
              <a href="#frota">
                Conheça nossa frota
                <ArrowRight className="transition-transform group-hover:translate-x-1" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/15 bg-ink/70 backdrop-blur-md hover:border-brand-soft/60">
              <a href={getWhatsAppUrl(WHATSAPP_MESSAGES.availability)} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon className="size-5" />
                Falar no WhatsApp
              </a>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      <motion.a
        href="#frota"
        style={{ opacity: cueOpacity }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 1 }}
        className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3 text-[11px] font-medium uppercase tracking-[0.3em] text-zinc-400 hover:text-white"
      >
        Role para explorar
        <span className="flex h-9 w-5 justify-center rounded-full border border-white/25 pt-1.5" aria-hidden>
          <span className="h-2 w-0.5 rounded-full bg-brand-soft animate-scroll-cue" />
        </span>
      </motion.a>
    </section>
  );
}
