import "server-only";
import { inflateRawSync } from "node:zlib";

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

/**
 * Extrai o texto de um DOCX (ZIP) lendo `word/document.xml` pelo diretório central.
 * Gemini não lê DOCX como documento, então a análise recebe o texto puro.
 * ponytail: ignora cabeçalhos/rodapés e ZIP64 (DOCX > 4 GB); usar biblioteca de ZIP se precisar.
 */
export function docxText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Arquivo DOCX inválido.");

  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0 && p + 46 <= buf.length; n--) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString("utf8", p + 46, p + 46 + nameLen) === "word/document.xml") {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      // Limite de saída evita "zip bomb"
      const xml = (method === 8 ? inflateRawSync(data, { maxOutputLength: 20 * 1024 * 1024 }) : data).toString("utf8");
      return xml
        .replace(/<\/w:p>|<w:br\/>/g, "\n")
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => ENTITIES[e])
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  throw new Error("Arquivo DOCX sem conteúdo de documento.");
}
