import { normalizeFuel } from "./vehicle-input";

export interface ParsedCrlv {
  plate?: string; renavam?: string; year?: number; yearModel?: string; name?: string;
  brand?: string; model?: string; fuel?: string; vehicleType?: string; chassis?: string; color?: string;
  rawText: string;
}
/** Parser de campos identificados; ausência nunca vira Flex, Carro ou ano inventado. */
export function parseCrlvText(text: string): Omit<ParsedCrlv, "rawText"> {
  const clean = text.toUpperCase().replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  const plate = clean.match(/\b([A-Z]{3}[ -]?\d[A-Z0-9]\d{2})\b/)?.[1]?.replace(/[ -]/g, "");
  const renavam = clean.match(/(?:RENAVAM|C[ÓO]DIGO RENAVAM)[ :]*([0-9]{9,11})\b/)?.[1];
  const paired = clean.match(/\b((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})\b/);
  const year = clean.match(/(?:ANO FABRICA[ÇC][ÃA]O|FABRICA[ÇC][ÃA]O)[ :]*((?:19|20)\d{2})\b/)?.[1] ?? paired?.[1];
  const yearModel = clean.match(/ANO MODELO[ :]*((?:19|20)\d{2})\b/)?.[1] ?? paired?.[2];
  const name: string | undefined = clean.match(/MARCA\s*\/\s*MODELO(?:\s*\/\s*VERS[ÃA]O)?[ :]*([A-Z0-9/ .-]+?)(?=\s+(?:ESP[ÉE]CIE|TIPO|PLACA|ANO|COMBUST|CHASSI|COR|CATEGORIA|CAPACIDADE)|$)/)?.[1]?.trim();
  let brand: string | undefined, model: string | undefined;
  if (name) { const parts = name.includes("/") ? name.split("/") : name.split(" "); brand = parts.shift()?.trim(); model = parts.join(name.includes("/") ? "/" : " ").trim() || undefined; }
  const fuel = clean.match(/COMBUST[ÍI]VEL[ :]*([A-ZÁÉÍÓÚÂÊÔÃÕ/ -]+?)(?=\s+(?:POT|CILIND|COR|CATEGORIA|CAPACIDADE|CHASSI|ANO|OBSERV|ESP[ÉE]CIE)|$)/)?.[1]?.trim();
  const chassis = clean.match(/CHASSI[ :]*([A-HJ-NPR-Z0-9]{17})\b/)?.[1];
  const color = clean.match(/\bCOR(?: PREDOMINANTE)?[ :]+(?!PREDOMINANTE\b)([A-ZÁÉÍÓÚÂÊÔÃÕ]+)\b/)?.[1];
  const kind = clean.match(/(?:ESP[ÉE]CIE\s*\/\s*TIPO|TIPO)[ :]*([A-ZÁÉÍÓÚÂÊÔÃÕ/ ]+?)(?=\s+(?:COMBUST|CHASSI|COR|ANO|CATEGORIA|CAPACIDADE)|$)/)?.[1];
  const ocr = parseCrlvOcrLines(text);
  const type = kind ?? ocr.kind;
  const vehicleType = type && /MOTOCICLETA|MOTONETA|CICLOMOTOR/.test(type) ? "Moto" : type && /CAMINH[ÃA]O|CAMINH[ÕO]ES/.test(type) ? "Caminhão" : type && /AUTOM[ÓO]VEL|CAMIONETA/.test(type) ? "Carro" : undefined;
  const fullName = name ?? ocr.name;
  if (!name && fullName) { const [b, ...m] = fullName.split("/"); brand = b.trim(); model = m.join("/").trim() || undefined; }
  const rawFuel = fuel ?? ocr.fuel;
  return { plate: plate ?? ocr.plate, renavam: renavam ?? ocr.renavam, year: Number(year ?? ocr.year) || undefined, yearModel: yearModel ?? ocr.yearModel, name: fullName, brand, model, fuel: rawFuel ? normalizeFuel(rawFuel) : undefined, chassis: chassis ?? ocr.chassis, color: color ?? ocr.color, vehicleType };
}

const CRLV_COLORS = /\b(AMARELA|AZUL|BEGE|BRANCA|CINZA|DOURADA|FANTASIA|GRENA|LARANJA|MARROM|PRATA|PRETA|ROSA|ROXA|VERDE|VERMELHA)\b/;
/** OCR (foto/PDF escaneado) do CRLV-e: rótulo numa linha, valor nas linhas seguintes; 0 lido como O. */
function parseCrlvOcrLines(text: string) {
  const lines = text.toUpperCase().split(/\r?\n/);
  const after = (label: RegExp, value: RegExp, span = 5) => {
    const i = lines.findIndex(l => label.test(l));
    if (i < 0) return undefined;
    for (const l of lines.slice(i + 1, i + 1 + span)) { const m = l.match(value); if (m) return m; }
  };
  const zero = (s: string) => s.replace(/O/g, "0");
  const p = [...text.toUpperCase().matchAll(/\b([A-Z]{3})[ -]?([0-9O])([A-Z0-9])([0-9O]{2})\b/g)].find(m => /\d/.test(m[0]));
  const plate = p ? p[1] + zero(p[2]) + p[3] + zero(p[4]) : undefined;
  const vin = text.toUpperCase().match(/\b[A-Z0-9]{17}\b/g)?.map(v => v.replace(/[OQ]/g, "0").replace(/I/g, "1")).find(v => /^[A-HJ-NPR-Z0-9]{17}$/.test(v) && (v.match(/\d/g)?.length ?? 0) >= 5);
  const years = after(/ANO\s*MODELO/, /\b((?:19|20)\d{2})\s+((?:19|20)\d{2})\b/, 2);
  return {
    plate, chassis: vin,
    renavam: after(/RENAVAM/, /^\s*(\d{9,11})\b/, 2)?.[1],
    year: years?.[1], yearModel: years?.[2],
    name: after(/MARCA\s*\/\s*MODELO/, /^\s*([A-Z0-9][A-Z0-9 .-]*\/[A-Z0-9 ./-]*?[A-Z0-9])(?=\s*[|(]|\s{2}|\s*$)/, 2)?.[1],
    kind: after(/ESP[ÉE]CIE/, /AUTOM[ÓO]VEL|CAMIONETA|MOTOCICLETA|MOTONETA|CICLOMOTOR|CAMINH[ÃA]O/)?.[0],
    fuel: after(/COMBUST/, /\b(?:[ÁA]LCOOL\/GASOLINA|GASOLINA\/[ÁA]LCOOL|FLEX|DIESEL|GASOLINA|[ÁA]LCOOL|ETANOL|EL[ÉE]TRIC[OA]|H[ÍI]BRID[OA]|GNV)\b/)?.[0],
    color: after(/COR\s*PREDOMINANTE/, CRLV_COLORS)?.[1],
  };
}
export interface CrlvTextItem { str: string; transform: number[] }
/** CRLV possui colunas; ordem interna do PDF não é ordem de leitura. Liga rótulo ao valor abaixo na mesma coluna. */
export function crlvLayoutText(items: CrlvTextItem[]): string {
  const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  const labels = ["CODIGO RENAVAM", "PLACA", "ANO FABRICACAO", "ANO MODELO", "MARCA / MODELO / VERSAO", "CHASSI", "COR PREDOMINANTE", "COMBUSTIVEL", "ESPECIE / TIPO"];
  const nonempty = items.filter(i => i.str.trim());
  const result: string[] = [];
  for (const label of labels) {
    const anchor = nonempty.find(i => normalize(i.str) === label);
    if (!anchor) continue;
    const [x, y] = anchor.transform.slice(4);
    const rowLabels = nonempty.filter(i => Math.abs(i.transform[5] - y) < 3 && i.transform[4] > x + 8);
    const right = Math.min(...rowLabels.map(i => i.transform[4]), x + 280);
    const below = nonempty.filter(i => (!normalize(i.str).includes("(R$)") && !labels.includes(normalize(i.str))) && y - i.transform[5] > 3 && y - i.transform[5] < 26 && i.transform[4] >= x - 3 && i.transform[4] < right - 3).sort((a,b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    const candidates = label === "CHASSI" ? below.filter(i => /^[A-HJ-NPR-Z0-9]{17}$/.test(i.str.trim())) : below;
    if (candidates.length) {
      const targetY = candidates[0].transform[5];
      const value = candidates.filter(i => Math.abs(i.transform[5] - targetY) < 3).sort((a,b) => a.transform[4] - b.transform[4]).map(i => i.str).join(" ");
      result.push(`${anchor.str}: ${value}`);
    }
  }
  return result.join("\n");
}

export const crlvFields = (parsed: Partial<ParsedCrlv>) => Object.entries(parsed).filter(([k,v]) => k !== "rawText" && k !== "name" && v !== undefined && v !== "").map(([k]) => k);

/** PDF textual via PDF.js; fotos/PDF escaneado via OCR local. Documentos nunca saem do navegador. */
export async function parseCrlvPdf(file: File | ArrayBuffer | Uint8Array, options: { signal?: AbortSignal; onProgress?: (message: string) => void } = {}): Promise<ParsedCrlv> {
  const bytes = file instanceof Uint8Array ? file : typeof File !== "undefined" && file instanceof File ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array(file as ArrayBuffer);
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error("Selecione um PDF, JPG ou PNG de até 15 MB.");
  const pdf = new TextDecoder().decode(bytes.slice(0,5)) === "%PDF-";
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpg = bytes[0] === 255 && bytes[1] === 216;
  if (!pdf && !png && !jpg) throw new Error("Arquivo inválido. Use PDF, JPG/JPEG ou PNG.");
  const check = () => { if (options.signal?.aborted) throw new DOMException("Importação cancelada", "AbortError"); };
  let ocr: Awaited<ReturnType<typeof import("tesseract.js").createWorker>> | undefined;
  const abort = () => { void ocr?.terminate(); };
  options.signal?.addEventListener("abort", abort, { once: true });
  const recognize = async (image: HTMLCanvasElement | Blob) => {
    check(); options.onProgress?.("Reconhecendo documento localmente…");
    const { createWorker } = await import("tesseract.js");
    ocr ??= await createWorker("por", 1, { workerPath: "/vendor/crlv/worker.min.js", corePath: "/vendor/crlv", langPath: "/vendor/crlv", workerBlobURL: false, cacheMethod: "none" });
    check(); const result = await ocr.recognize(image); check(); return result.data.text;
  };
  const deadline = window.setTimeout(abort, 90_000);
  let text = "";
  try {
    check();
    if (pdf) {
      options.onProgress?.("Lendo PDF…");
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/crlv/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
      const stop = () => { void task.destroy(); };
      options.signal?.addEventListener("abort", stop, { once: true });
      try {
        const doc = await task.promise;
        if (doc.numPages > 5) throw new Error("O documento deve ter no máximo 5 páginas.");
        for (let n = 1; n <= doc.numPages; n++) {
          check(); const page = await doc.getPage(n); const content = await page.getTextContent();
          const positioned = content.items.filter((i): i is typeof i & CrlvTextItem => "str" in i && "transform" in i);
          const layoutText = crlvLayoutText(positioned);
          const pageText = crlvFields(parseCrlvText(layoutText)).length >= 2 ? layoutText : positioned.map(i => i.str).join("\n");
          if (crlvFields(parseCrlvText(pageText)).length >= 2) text += "\n" + pageText;
          else {
            const viewport = page.getViewport({ scale: 1.8 });
            if (viewport.width * viewport.height > 12_000_000) throw new Error("Página muito grande para leitura segura.");
            const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
            await page.render({ canvas, viewport }).promise; text += "\n" + await recognize(canvas);
          }
          page.cleanup();
        }
      } finally { options.signal?.removeEventListener("abort", stop); await task.destroy(); }
    } else text = await recognize(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: png ? "image/png" : "image/jpeg" }));
    check(); const parsed = parseCrlvText(text);
    if (!crlvFields(parsed).length) throw new Error("Não foi possível identificar campos do CRLV. Use uma imagem legível ou preencha manualmente.");
    return { ...parsed, rawText: "" }; // Texto integral não persiste nem vai a logs.
  } finally { window.clearTimeout(deadline); options.signal?.removeEventListener("abort", abort); await ocr?.terminate().catch(() => {}); }
}
