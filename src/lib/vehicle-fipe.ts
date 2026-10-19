import { FIPE_TYPES, type FipeDetail, type FipeOption } from "./fipe";
import { normalizeFuel, normalizeVehicleText } from "./vehicle-input";

export interface VehicleFipeIdentity { vehicleType: string; brand: string; model: string; yearModel: string; fuel: string }
export function vehicleFipeIdentity(value: VehicleFipeIdentity) {
  return [value.vehicleType, value.brand, value.model, value.yearModel, normalizeFuel(value.fuel)].map(normalizeVehicleText).join("|");
}
export function fipeSelectionValid(identity: VehicleFipeIdentity, selection: { detail: FipeDetail; identity: string }) {
  const d = selection.detail;
  return vehicleFipeIdentity(identity) === selection.identity
    && normalizeVehicleText(identity.brand) === normalizeVehicleText(d.brand)
    && normalizeVehicleText(identity.vehicleType) === normalizeVehicleText(FIPE_TYPES[d.type].label)
    && normalizeVehicleText(normalizeFuel(identity.fuel)) === normalizeVehicleText(normalizeFuel(d.fuel))
    && (d.modelYear === 32000 || String(Number(identity.yearModel)) === String(d.modelYear));
}
const words = (s: string): string[] => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
/** Igualdade primeiro; depois token inteiro (evita Mobi/Mobility). Sufixo de versão do DETRAN
 * ("KWID ZEN 10MT") não existe na FIPE: descarta palavras finais até casar; ambiguidade segue para escolha do usuário. */
export function fipeModelCandidates(models: FipeOption[], model: string) {
  const canonical = normalizeVehicleText(model);
  const exact = models.filter(m => normalizeVehicleText(m.name) === canonical);
  if (exact.length) return exact;
  const hay = models.map(m => ({ m, w: words(m.name) }));
  for (let w = words(model); w.length; w = w.slice(0, -1)) {
    const found = hay.filter(h => w.every(x => h.w.includes(x))).map(h => h.m);
    if (found.length) return found;
  }
  return [];
}
