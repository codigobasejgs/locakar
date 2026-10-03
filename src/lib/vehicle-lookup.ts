/** Contrato para futuro fornecedor autorizado de consulta por placa. FIPE não possui esse recurso. */
export interface VehicleLookupData {
  plate: string;
  vehicleType?: "Carro" | "Moto" | "Caminhão";
  brand?: string;
  model?: string;
  modelYear?: number;
  manufactureYear?: number;
  fuel?: string;
  color?: string;
}
export interface VehicleLookupProvider { lookupByPlate(plate: string): Promise<VehicleLookupData | null> }
// ponytail: nenhum fornecedor contratado; conectar uma implementação autorizada sem usar a FIPE para placa.
export const vehicleLookupConfigured = false;
