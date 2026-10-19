/** Equivalências de combustível na entrada; não converte dados desconhecidos em Flex. */
export function normalizeFuel(value: string): string {
  const key = value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (/hibrid/.test(key)) return "Híbrido";
  if (/eletric/.test(key)) return "Elétrico";
  if (/diesel/.test(key)) return "Diesel";
  if (/flex/.test(key) || (/gasolina/.test(key) && /alcool|etanol/.test(key))) return "Flex";
  if (/etanol|alcool/.test(key)) return "Etanol";
  if (/gasolina/.test(key)) return "Gasolina";
  if (/gnv|gas natural/.test(key)) return "GNV";
  return value.trim();
}
export const normalizeVehicleText = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
export const VEHICLE_FUELS = ["Etanol", "Gasolina", "Flex", "Diesel", "Elétrico", "Híbrido", "GNV"];
