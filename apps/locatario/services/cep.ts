/**
 * Busca de endereço por CEP utilizando a API pública e gratuita ViaCEP.
 */

export interface AddressFromCep {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export async function fetchAddressByCep(cep: string): Promise<AddressFromCep | null> {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      cep?: string;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
      erro?: boolean;
    };
    if (json.erro || !json.uf) return null;
    return {
      cep: json.cep ?? clean,
      street: json.logradouro ?? "",
      neighborhood: json.bairro ?? "",
      city: json.localidade ?? "",
      state: json.uf ?? "",
    };
  } catch {
    return null;
  }
}
