/**
 * Leitor inteligente de CRLV-e Digital (Certificado de Registro e Licenciamento de Veículo).
 * Analisa o arquivo PDF oficial exportado da Carteira Digital de Trânsito / Detran / Senatran
 * e extrai automaticamente: Placa, Renavam, Marca/Modelo, Ano Fabricação/Modelo e Combustível.
 * Roda 100% no navegador (client-side) usando DecompressionStream nativo.
 */

export interface ParsedCrlv {
  plate?: string;
  renavam?: string;
  year?: number;
  yearModel?: string;
  name?: string;
  brand?: string;
  model?: string;
  fuel?: string;
  vehicleType?: string;
  rawText: string;
}

function decodeHex(h: string): string {
  try {
    const clean = h.replace(/\s+/g, "");
    if (clean.length % 2 !== 0) return "";
    let str = "";
    for (let i = 0; i < clean.length; i += 2) {
      str += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
    }
    return str;
  } catch {
    return "";
  }
}

function extractTextFromStream(streamText: string): string {
  let result = "";
  // 1. Strings literais: (texto) Tj ou [(t1) 10 (t2)] TJ
  const literals = [...streamText.matchAll(/\(([^()]+)\)/g)].map((m) => m[1]);
  if (literals.length) result += " " + literals.join(" ");

  // 2. Strings hexadecimais: <48656C6C6F> Tj
  const hexes = [...streamText.matchAll(/<([0-9A-Fa-f\s]{4,})>/g)].map((m) => decodeHex(m[1]));
  if (hexes.length) result += " " + hexes.join(" ");

  return result;
}

async function decompress(bytes: Uint8Array): Promise<string> {
  // Tenta descompactar via DecompressionStream nativo do navegador
  if (typeof DecompressionStream !== "undefined") {
    try {
      const ds = new DecompressionStream("deflate");
      const writer = ds.writable.getWriter();
      writer.write(bytes as unknown as BufferSource);
      writer.close();
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      return new TextDecoder("latin1").decode(merged);
    } catch {
      /* se falhar, tenta como texto direto */
    }
  }
  return new TextDecoder("latin1").decode(bytes);
}

export function parseCrlvText(text: string): Omit<ParsedCrlv, "rawText"> {
  const clean = text.replace(/[\r\n\t]+/g, " ");

  // Placa: padrão mercosul (ABC1D23) ou antigo (ABC1234)
  const plateMatch =
    clean.match(/(?:PLACA|Placa)[\s:]*([A-Z]{3}[0-9][A-Z0-9][0-9]{2})/i)?.[1] ??
    clean.match(/\b([A-Z]{3}[0-9][A-Z0-9][0-9]{2})\b/)?.[1];

  // Renavam: 9 a 11 dígitos numéricos
  const renavamMatch =
    clean.match(/(?:RENAVAM|C[ÓO]DIGO\s*RENAVAM)[\s:]*([0-9]{9,11})/i)?.[1] ??
    clean.match(/\b([0-9]{11})\b/)?.[1];

  // Ano fabricação e ano modelo
  const yearFab = clean.match(/(?:ANO\s*FABRICA[ÇC][ÃA]O|FABRICA[ÇC][ÃA]O)[\s:]*([0-9]{4})/i)?.[1];
  const yearModel =
    clean.match(/(?:ANO\s*MODELO)[\s:]*([0-9]{4})/i)?.[1] ??
    clean.match(/([0-9]{4})\s*\/\s*([0-9]{4})/)?.[2];

  // Marca / Modelo
  const mmRaw = clean.match(/(?:MARCA\s*\/\s*MODELO(?:\s*\/\s*VERS[ÃA]O)?|MARCA\/MODELO)[\s:]*([A-Z0-9/\s.-]+?)(?=\s*(?:ESP[ÉE]CIE|TIPO|PLACA|ANO|COMBUST|CHASSI|COR|CATEGORIA|$))/i)?.[1]?.trim();

  // Combustível
  const fuelRaw = clean.match(/(?:COMBUST[ÍI]VEL)[\s:]*([A-ZÁÉÍÓÚÂÊÔÃÕ/\s]+?)(?=\s*(?:POT|CILIND|COR|CATEGORIA|CAPACIDADE|$))/i)?.[1]?.trim();

  let fuel = "Flex";
  if (fuelRaw) {
    if (/DIESEL/i.test(fuelRaw)) fuel = "Diesel";
    else if (/GASOLINA/i.test(fuelRaw) && !/ALCOOL|[ÁA]LCOOL/i.test(fuelRaw)) fuel = "Gasolina";
    else if (/EL[ÉE]TRICO/i.test(fuelRaw)) fuel = "Elétrico";
    else if (/H[ÍI]BRIDO/i.test(fuelRaw)) fuel = "Híbrido";
  }

  let brand = "";
  let model = "";
  let name = "";
  if (mmRaw) {
    name = mmRaw.replace(/\s+/g, " ");
    if (name.includes("/")) {
      const parts = name.split("/");
      brand = parts[0].trim();
      model = parts.slice(1).join("/").trim();
    } else {
      const parts = name.split(" ");
      brand = parts[0];
      model = parts.slice(1).join(" ");
    }
  }

  return {
    plate: plateMatch?.toUpperCase(),
    renavam: renavamMatch,
    year: yearFab ? Number(yearFab) : undefined,
    yearModel: yearModel || yearFab,
    name: name || undefined,
    brand: brand || undefined,
    model: model || undefined,
    fuel,
    vehicleType: "Carro",
  };
}

export async function parseCrlvPdf(fileOrBytes: File | ArrayBuffer | Uint8Array): Promise<ParsedCrlv> {
  const bytes =
    fileOrBytes instanceof File
      ? new Uint8Array(await fileOrBytes.arrayBuffer())
      : fileOrBytes instanceof Uint8Array
      ? fileOrBytes
      : new Uint8Array(fileOrBytes);

  const rawStr = new TextDecoder("latin1").decode(bytes);
  let extractedText = "";

  // Procura por todos os blocos `stream ... endstream` no PDF
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRegex.exec(rawStr)) !== null) {
    const streamBytes = new Uint8Array(match[1].length);
    for (let i = 0; i < match[1].length; i++) streamBytes[i] = match[1].charCodeAt(i);
    const decompressed = await decompress(streamBytes);
    extractedText += " " + extractTextFromStream(decompressed || match[1]);
  }

  // Também varre texto não compactado presente no arquivo
  extractedText += " " + extractTextFromStream(rawStr);

  const parsed = parseCrlvText(extractedText);
  return {
    ...parsed,
    rawText: extractedText.trim(),
  };
}
