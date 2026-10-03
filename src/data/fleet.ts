import type { Vehicle } from "@/types";

/**
 * Modelos exibidos na Landing Page — apenas os veículos presentes nos assets fornecidos.
 * Especificações de fábrica das versões de entrada; revise antes de publicar.
 * Valores de diária não são exibidos (não informados nos arquivos): o preço é consultado via WhatsApp.
 */
export const PUBLIC_FLEET: Vehicle[] = [
  {
    id: "fiat-mobi",
    name: "Fiat Mobi",
    brand: "Fiat",
    model: "Mobi",
    year: 2024,
    image: "/vehicles/fiat-mobi.jpg",
    category: "Hatch compacto",
    transmission: "Manual",
    fuel: "Flex",
    seats: 5,
    airConditioning: true,
    status: "available",
  },
  {
    id: "renault-kwid",
    name: "Renault Kwid",
    brand: "Renault",
    model: "Kwid",
    year: 2024,
    image: "/vehicles/renault-kwid.jpg",
    category: "Compacto urbano",
    transmission: "Manual",
    fuel: "Flex",
    seats: 5,
    airConditioning: true,
    status: "available",
  },
];
