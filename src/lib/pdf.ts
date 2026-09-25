/**
 * PDFs oficiais enviados ao cliente (e-mail e WhatsApp): contrato assinado e termos de vistoria.
 * Gerados no servidor com pdf-lib (JS puro, sem navegador). Fontes padrão do PDF: acentos do português OK.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { Contract, Inspection } from "@/types";
import { COMPANY } from "./company";
import { FUEL_LABEL } from "./contract";
import { formatCurrency, formatNumber } from "./utils";

const A4: [number, number] = [595.28, 841.89];
const M = 48;
const W = A4[0] - M * 2;
const BOTTOM = 64;
const C = {
  ink: rgb(0.09, 0.09, 0.1),
  muted: rgb(0.44, 0.44, 0.48),
  line: rgb(0.88, 0.88, 0.9),
  brand: rgb(0.545, 0, 0.545),
  soft: rgb(0.98, 0.95, 0.98),
  ok: rgb(0.02, 0.5, 0.27),
  bad: rgb(0.75, 0.1, 0.1),
  black: rgb(0.02, 0.02, 0.02),
  white: rgb(1, 1, 1),
  light: rgb(0.78, 0.78, 0.8),
};

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—";

/** As fontes padrão do PDF só codificam WinAnsi (latim): remove emoji e afins. */
const clean = (s: string) =>
  s.replace(/[  \t]/g, " ").replace(/[^\n\x20-\x7E\xA0-\xFF–—‘’“”•…]/g, "");

let logo: Promise<Uint8Array | null> | undefined;
const logoBytes = () =>
  (logo ??= readFile(path.join(process.cwd(), "public/logos/locakar-logo-light.png")).then(
    (b) => new Uint8Array(b),
    () => null, // sem o arquivo, o cabeçalho usa o nome em texto
  ));

const pngFromDataUrl = (src?: string) =>
  src?.startsWith("data:image/png;base64,") ? Buffer.from(src.slice("data:image/png;base64,".length), "base64") : null;

async function writer(opts: { title: string; subtitle: string; badge?: string; footer: string }) {
  const doc = await PDFDocument.create();
  doc.setTitle(opts.title);
  doc.setAuthor(COMPANY.name);
  doc.setCreator(COMPANY.name);
  doc.setProducer(COMPANY.name);
  doc.setLanguage("pt-BR");
  const f = {
    r: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    m: await doc.embedFont(StandardFonts.Courier),
  };
  const bytes = await logoBytes();
  const logoImg: PDFImage | null = bytes ? await doc.embedPng(bytes) : null;
  let page!: PDFPage;
  let y = 0;

  const right = (t: string, font: PDFFont, size: number) => M + W - font.widthOfTextAtSize(t, size);

  const addPage = () => {
    page = doc.addPage(A4);
    const top = A4[1];
    const H = 80;
    page.drawRectangle({ x: 0, y: top - H, width: A4[0], height: H, color: C.black });
    page.drawRectangle({ x: 0, y: top - H - 3, width: A4[0], height: 3, color: C.brand });
    if (logoImg) {
      const s = logoImg.scaleToFit(112, 56);
      page.drawImage(logoImg, { x: M, y: top - H / 2 - s.height / 2, ...s });
    } else page.drawText(COMPANY.name, { x: M, y: top - H / 2 - 7, size: 20, font: f.b, color: C.white });
    const title = clean(opts.title);
    const sub = clean(opts.subtitle);
    page.drawText(title, { x: right(title, f.b, 13), y: top - 32, size: 13, font: f.b, color: C.white });
    page.drawText(sub, { x: right(sub, f.r, 8.5), y: top - 47, size: 8.5, font: f.r, color: C.light });
    if (opts.badge) {
      const bw = f.b.widthOfTextAtSize(opts.badge, 7) + 14;
      page.drawRectangle({ x: M + W - bw, y: top - 68, width: bw, height: 14, color: C.brand });
      page.drawText(opts.badge, { x: M + W - bw + 7, y: top - 63.5, size: 7, font: f.b, color: C.white });
    }
    y = top - H - 28;
  };

  const ensure = (h: number) => {
    if (y - h < BOTTOM) addPage();
  };

  /** Quebra o texto em linhas que cabem na largura (palavras longas, como o hash, são partidas). */
  const wrap = (text: string, font: PDFFont, size: number, width: number) => {
    const out: string[] = [];
    for (const p of clean(text).split("\n")) {
      let cur = "";
      for (let word of p.split(/\s+/).filter(Boolean)) {
        while (font.widthOfTextAtSize(word, size) > width) {
          let i = word.length;
          while (i > 1 && font.widthOfTextAtSize(word.slice(0, i), size) > width) i--;
          if (cur) out.push(cur);
          cur = "";
          out.push(word.slice(0, i));
          word = word.slice(i);
        }
        const next = cur ? `${cur} ${word}` : word;
        if (cur && font.widthOfTextAtSize(next, size) > width) {
          out.push(cur);
          cur = word;
        } else cur = next;
      }
      out.push(cur);
    }
    return out;
  };

  const para = (text: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const { font = f.r, size = 9.5, color = C.ink, gap = 6 } = o;
    for (const l of wrap(text, font, size, W)) {
      ensure(size * 1.5);
      page.drawText(l, { x: M, y: y - size, size, font, color });
      y -= size * 1.5;
    }
    y -= gap;
  };

  const heading = (title: string, intro?: string) => {
    ensure(60);
    page.drawText(clean(title), { x: M, y: y - 16, size: 16, font: f.b, color: C.ink });
    y -= 28;
    if (intro) para(intro, { color: C.muted, size: 9.5, gap: 8 });
  };

  const section = (title: string) => {
    ensure(48);
    y -= 6;
    page.drawRectangle({ x: M, y: y - 13, width: 3, height: 13, color: C.brand });
    page.drawText(clean(title), { x: M + 10, y: y - 10.5, size: 10.5, font: f.b, color: C.ink });
    y -= 20;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: C.line });
    y -= 10;
  };

  /** Grade de 2 colunas: rótulo pequeno em cima, valor embaixo. */
  const fields = (pairs: [string, string][]) => {
    const colW = (W - 18) / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      const row = pairs.slice(i, i + 2);
      const lines = row.map(([, v]) => wrap(v || "—", f.r, 10, colW));
      const h = 24 + (Math.max(...lines.map((l) => l.length)) - 1) * 13 + 8;
      ensure(h);
      row.forEach(([k], j) => {
        const x = M + j * (colW + 18);
        page.drawText(clean(k.toUpperCase()), { x, y: y - 7, size: 6.8, font: f.b, color: C.muted });
        lines[j].forEach((l, n) => page.drawText(l, { x, y: y - 21 - n * 13, size: 10, font: f.r, color: C.ink }));
      });
      y -= h;
    }
    y -= 4;
  };

  /** Linha de tabela: rótulo à esquerda, valor à direita (quebra se preciso). */
  const row = (label: string, value: string, o: { color?: ReturnType<typeof rgb>; mono?: boolean } = {}) => {
    const font = o.mono ? f.m : f.b;
    const size = o.mono ? 8 : 9.5;
    const labelW = 190;
    const lines = wrap(value || "—", font, size, W - labelW);
    const h = lines.length * (size + 4) + 10;
    ensure(h);
    page.drawText(clean(label), { x: M, y: y - 12, size: 9, font: f.r, color: C.muted });
    lines.forEach((l, n) => page.drawText(l, { x: M + labelW, y: y - 12 - n * (size + 4), size, font, color: o.color ?? C.ink }));
    y -= h;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: M + W, y: y + 3 }, thickness: 0.5, color: C.line });
  };

  const signatures = async (sigs: { image?: string; name: string; role: string; note: string }[]) => {
    ensure(130);
    y -= 14;
    const colW = (W - 36) / 2;
    const center = (t: string, font: PDFFont, size: number, x: number) => x + Math.max(0, (colW - font.widthOfTextAtSize(t, size)) / 2);
    for (const [j, s] of sigs.entries()) {
      const x = M + j * (colW + 36);
      const bytes = pngFromDataUrl(s.image);
      if (bytes) {
        const img = await doc.embedPng(bytes);
        const d = img.scaleToFit(colW - 30, 56);
        page.drawImage(img, { x: x + (colW - d.width) / 2, y: y - 62 + (56 - d.height) / 2, ...d });
      }
      page.drawLine({ start: { x, y: y - 66 }, end: { x: x + colW, y: y - 66 }, thickness: 0.8, color: C.ink });
      const name = clean(s.name);
      page.drawText(name, { x: center(name, f.b, 9.5, x), y: y - 80, size: 9.5, font: f.b, color: C.ink });
      page.drawText(s.role, { x: center(s.role, f.b, 7, x), y: y - 92, size: 7, font: f.b, color: C.brand });
      const note = clean(s.note);
      page.drawText(note, { x: center(note, f.r, 7.5, x), y: y - 103, size: 7.5, font: f.r, color: C.muted });
    }
    y -= 116;
  };

  const finish = async () => {
    const pages = doc.getPages();
    const footer = clean(opts.footer);
    pages.forEach((p, i) => {
      p.drawLine({ start: { x: M, y: 46 }, end: { x: M + W, y: 46 }, thickness: 0.6, color: C.line });
      p.drawText(clean(`${COMPANY.name} · ${COMPANY.site} · WhatsApp ${COMPANY.whatsapp.display}`), { x: M, y: 34, size: 7.5, font: f.r, color: C.muted });
      const n = `Página ${i + 1} de ${pages.length}`;
      p.drawText(n, { x: right(n, f.r, 7.5), y: 34, size: 7.5, font: f.r, color: C.muted });
      p.drawText(footer, { x: M, y: 23, size: 6.2, font: f.m, color: C.muted });
    });
    return doc.save();
  };

  addPage();
  return { f, ensure, addPage, para, heading, section, fields, row, signatures, finish };
}

/** Contrato com as assinaturas e, se assinado, o certificado de assinatura eletrônica na última página. */
export async function contractPdf(c: Contract): Promise<Uint8Array> {
  const signed = c.status === "signed";
  const w = await writer({
    title: "Contrato de locação de veículo",
    subtitle: `Documento nº ${c.id.slice(0, 8).toUpperCase()} · emitido em ${when(c.issuedAt)}`,
    badge: signed ? "ASSINADO ELETRONICAMENTE" : undefined,
    footer: `Documento ${c.id} · SHA-256 ${c.contentHash ?? "—"}`,
  });

  // O texto do contrato vem de buildContractText: títulos em caixa alta, "Rótulo: valor" e cláusulas numeradas.
  const lines = c.content.split("\n");
  let pairs: [string, string][] = [];
  let clauses = false;
  const flush = () => {
    if (pairs.length) w.fields(pairs);
    pairs = [];
  };
  for (const [idx, raw] of lines.entries()) {
    const l = raw.trim();
    if (!l || (idx === 0 && l.startsWith("CONTRATO DE LOCA"))) continue;
    if (/^[A-ZÀ-Ý0-9 ]{3,40}$/.test(l)) {
      flush();
      w.section(l.charAt(0) + l.slice(1).toLowerCase());
      clauses = l.startsWith("CLÁUSULAS");
      continue;
    }
    const kv = !clauses && l.match(/^([^:]{2,40}):\s*(.*)$/);
    if (kv) {
      pairs.push([kv[1], kv[2]]);
      continue;
    }
    flush();
    const clause = clauses && l.match(/^(\d+\.\s*[^.]{2,60}\.)\s*(.*)$/);
    if (clause) {
      w.ensure(50); // título da cláusula não fica sozinho no fim da página
      w.para(clause[1], { font: w.f.b, gap: 1 });
      if (clause[2]) w.para(clause[2]);
    } else w.para(l);
  }
  flush();

  await w.signatures([
    { image: c.companySignature, name: c.companySigner ?? "LOCADORA", role: "LOCADORA", note: `Emitido em ${when(c.issuedAt)}` },
    {
      image: signed ? c.signature : undefined,
      name: c.signedName ?? c.clientName,
      role: "LOCATÁRIO",
      note: signed ? `Assinado eletronicamente em ${when(c.signedAt)}` : "Aguardando assinatura",
    },
  ]);

  if (signed) {
    w.addPage();
    w.heading(
      "Certificado de assinatura eletrônica",
      "Registro técnico da assinatura deste contrato, gerado automaticamente pela plataforma da LOCAKAR no momento da assinatura.",
    );
    w.section("Assinatura");
    w.row("Documento", `Contrato de locação nº ${c.id.slice(0, 8).toUpperCase()}`);
    w.row("Identificador", c.id, { mono: true });
    w.row("Locação vinculada", c.rentalId.slice(0, 8).toUpperCase());
    w.row("Emitido em", `${when(c.issuedAt)} (horário de Brasília)`);
    w.row("Assinado por", c.signedName ?? c.clientName);
    w.row("CPF do assinante", c.signedCpf ?? c.clientCpf);
    w.row("Data e hora", `${when(c.signedAt)} (horário de Brasília)`);
    w.row("Endereço IP", c.signedIp ?? "—", { mono: true });
    if (c.signedUserAgent) w.row("Dispositivo / navegador", c.signedUserAgent, { mono: true });
    w.row("Situação", "ASSINADO", { color: C.ok });

    w.section("Como a identidade foi confirmada");
    for (const item of [
      "Link pessoal e intransferível enviado ao e-mail e/ou WhatsApp cadastrados do locatário.",
      "Confirmação do CPF do locatário, conferido com o CPF registrado no contrato.",
      "Selfie capturada ao vivo pela câmera no ato da assinatura (arquivada com a LOCAKAR).",
      "Assinatura manuscrita desenhada na tela e aceite expresso de todas as cláusulas.",
      "Registro de data, hora, endereço IP e dispositivo utilizados.",
    ])
      w.para(`•  ${item}`, { gap: 2 });

    w.section("Integridade do documento");
    w.para(
      "O código abaixo (SHA-256) é a impressão digital do texto do contrato. Qualquer alteração no conteúdo, por menor que seja, gera um código diferente. Após a assinatura, o contrato fica bloqueado para edição.",
      { color: C.muted },
    );
    w.row("SHA-256", c.contentHash ?? "—", { mono: true });

    w.section("Validade jurídica");
    w.para(
      "Este contrato foi assinado eletronicamente pelas partes, que reconhecem a validade deste meio de comprovação de autoria e integridade, nos termos do art. 10, § 2º, da Medida Provisória nº 2.200-2/2001 e dos arts. 104 e 107 do Código Civil.",
      { color: C.muted },
    );
  }
  return w.finish();
}

export async function inspectionPdf(kind: "delivery" | "return", i: Inspection, meta: { clientName: string; vehicle: string; plate: string }) {
  const delivery = kind === "delivery";
  const w = await writer({
    title: delivery ? "Termo de entrega do veículo" : "Termo de devolução do veículo",
    subtitle: `${delivery ? "Vistoria de saída (check-out)" : "Vistoria de retorno (check-in)"} · ${when(i.at)}`,
    footer: `Vistoria ${delivery ? "de entrega" : "de devolução"} · ${meta.plate} · ${when(i.at)}`,
  });
  w.section("Dados da vistoria");
  w.fields([
    ["Locatário", meta.clientName],
    ["Veículo", `${meta.vehicle} · ${meta.plate}`],
    ["Data e hora", `${when(i.at)} (horário de Brasília)`],
    ["Quilometragem", `${formatNumber(i.km)} km`],
    ["Combustível", FUEL_LABEL[i.fuel]],
    ...(i.extraCharges ? ([["Valores adicionais", formatCurrency(i.extraCharges)]] as [string, string][]) : []),
  ]);
  w.section("Checklist");
  for (const it of i.items) w.row(it.label, it.ok ? "OK" : `COM AVARIA${it.note ? ` — ${it.note}` : ""}`, { color: it.ok ? C.ok : C.bad });
  if (i.damages) {
    w.section("Avarias registradas");
    w.para(i.damages);
  }
  if (i.notes) {
    w.section("Observações");
    w.para(i.notes);
  }
  await w.signatures([
    { name: i.staffName, role: "RESPONSÁVEL LOCAKAR", note: when(i.at) },
    { image: i.clientSignature, name: i.clientName, role: "LOCATÁRIO", note: `Assinado em ${when(i.at)}` },
  ]);
  return w.finish();
}
