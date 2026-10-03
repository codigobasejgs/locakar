import { Cog, Fuel, Snowflake, Users } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { PUBLIC_FLEET } from "@/data/fleet";
import { WHATSAPP_MESSAGES } from "@/lib/company";
import { VEHICLE_STATUS } from "@/lib/constants";
import { getWhatsAppUrl } from "@/lib/whatsapp";
import type { Vehicle } from "@/types";
import { Reveal, SectionHeading } from "./reveal";

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const specs = [
    { icon: Cog, label: "Transmissão", value: vehicle.transmission },
    { icon: Fuel, label: "Combustível", value: vehicle.fuel },
    { icon: Users, label: "Lugares", value: `${vehicle.seats} lugares` },
    { icon: Snowflake, label: "Ar-condicionado", value: vehicle.airConditioning ? "Ar-condicionado" : "Sem ar" },
  ];
  const status = VEHICLE_STATUS[vehicle.status];

  return (
    <article className="group glass relative flex h-full flex-col overflow-hidden rounded-3xl transition-all duration-500 hover:-translate-y-1.5 hover:border-magenta/40 hover:shadow-glow">
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-b from-white to-zinc-200">
        <Image
          src={vehicle.image}
          alt={`${vehicle.name} — ${vehicle.category}`}
          fill
          sizes="(min-width: 1024px) 560px, (min-width: 640px) 50vw, 100vw"
          className="object-contain p-4 mix-blend-multiply transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <div className="absolute left-4 top-4">
          <Badge tone={status.tone} className="bg-ink/85 backdrop-blur">
            {status.label}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-soft">{vehicle.category}</p>
          <h3 className="mt-1.5 font-display text-2xl font-semibold">{vehicle.name}</h3>
        </div>

        <ul className="grid grid-cols-2 gap-2.5 text-sm text-zinc-300" aria-label={`Especificações do ${vehicle.name}`}>
          {specs.map(({ icon: Icon, label, value }) => (
            <li key={label} className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2">
              <Icon className="size-4 shrink-0 text-brand-soft" aria-hidden />
              <span className="sr-only">{label}: </span>
              {value}
            </li>
          ))}
        </ul>

        <Button asChild variant="primary" size="lg" className="mt-auto w-full">
          <a
            href={getWhatsAppUrl(WHATSAPP_MESSAGES.vehicle(vehicle.name))}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Consultar disponibilidade do ${vehicle.name} pelo WhatsApp`}
          >
            <WhatsAppIcon className="size-4" />
            Consultar disponibilidade
          </a>
        </Button>
      </div>
    </article>
  );
}

export function FleetSection() {
  return (
    <section id="frota" aria-labelledby="frota-title" className="relative scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div id="frota-title">
          <SectionHeading
            eyebrow="Nossa Frota"
            title="Veículos prontos para o seu caminho."
            description="Modelos econômicos e práticos para o dia a dia. Consulte a disponibilidade diretamente com a nossa equipe."
          />
        </div>

        <div className="mx-auto mt-14 grid max-w-5xl gap-6 sm:grid-cols-2 lg:gap-8">
          {PUBLIC_FLEET.map((vehicle, i) => (
            <Reveal key={vehicle.id} delay={i * 0.12}>
              <VehicleCard vehicle={vehicle} />
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 text-center">
          <a
            href={getWhatsAppUrl(WHATSAPP_MESSAGES.fleet)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-zinc-300 underline-offset-4 hover:text-white hover:underline"
          >
            Quer conhecer todas as opções disponíveis? Fale com a LOCAKAR →
          </a>
        </Reveal>
      </div>
    </section>
  );
}
