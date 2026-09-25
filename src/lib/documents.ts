/**
 * Documentos imprimíveis (HTML autocontido): contrato assinado e termos de vistoria.
 * Usados na tela (impressão/PDF pelo navegador) e como anexo dos e-mails.
 * ponytail: HTML em vez de PDF para não adicionar gerador de PDF no servidor; o cliente salva em PDF pelo navegador.
 */
import type { Contract, Inspection } from "@/types";
import { COMPANY } from "./company";
import { FUEL_LABEL } from "./contract";
import { formatCurrency, formatNumber } from "./utils";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const img = (src?: string) => (src?.startsWith("data:image/png;base64,") ? `<img src="${src}" alt="assinatura" style="height:70px;max-width:260px">` : "");

function page(title: string, body: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#18181b;max-width:760px;margin:24px auto;padding:0 20px;line-height:1.5}
h1{font-size:20px;margin:0 0 4px}pre{white-space:pre-wrap;font-family:inherit;font-size:13px}
.box{border:1px solid #d4d4d8;border-radius:10px;padding:14px 16px;margin:14px 0}.muted{color:#71717a;font-size:12px}
.sig{display:flex;gap:24px;flex-wrap:wrap}.sig>div{flex:1;min-width:240px;border-top:1px solid #18181b;padding-top:6px;margin-top:40px}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:5px 0;border-bottom:1px solid #f4f4f5}
@media print{body{margin:0}}</style></head><body>
<p class="muted">${esc(COMPANY.name)} · ${esc(COMPANY.site)} · WhatsApp ${esc(COMPANY.whatsapp.display)}</p>${body}</body></html>`;
}

/** `withSelfie`: só para uso interno da equipe (impressão pelo painel). E-mails nunca levam a foto. */
export function contractDocument(c: Contract, { withSelfie = false }: { withSelfie?: boolean } = {}) {
  const signed = c.status === "signed";
  const selfie = c.selfie?.startsWith("data:image/jpeg;base64,") ? c.selfie : undefined;
  return page(
    "Contrato de locação — LOCAKAR",
    `<pre>${esc(c.content)}</pre>
<div class="sig">
  <div>${img(c.companySignature)}<br><strong>${esc(c.companySigner ?? "LOCADORA")}</strong><br><span class="muted">LOCADORA · emitido em ${when(c.issuedAt)}</span></div>
  <div>${signed ? img(c.signature) : ""}<br><strong>${esc(c.signedName ?? c.clientName)}</strong><br><span class="muted">LOCATÁRIO · ${signed ? `assinado em ${when(c.signedAt)}` : "aguardando assinatura"}</span></div>
</div>
<div class="box muted">
  <strong>Registro de assinatura eletrônica</strong><br>
  Situação: ${signed ? "ASSINADO" : c.status === "cancelled" ? "CANCELADO" : "AGUARDANDO ASSINATURA"}<br>
  ${signed ? `Assinado por ${esc(c.signedName ?? "")} (CPF ${esc(c.signedCpf ?? "")}) em ${when(c.signedAt)} · IP ${esc(c.signedIp ?? "—")}<br>` : ""}
  ${signed ? `Identidade confirmada por CPF e selfie capturada ao vivo no ato da assinatura${withSelfie && selfie ? "" : " (arquivada com a LOCAKAR)"}.<br>` : ""}
  ${withSelfie && selfie ? `<img src="${selfie}" alt="selfie do assinante" style="height:120px;border-radius:8px;margin:6px 0"><br>` : ""}
  Código de integridade do conteúdo (SHA-256): ${esc(c.contentHash ?? "—")}
</div>`,
  );
}

export function inspectionDocument(kind: "delivery" | "return", i: Inspection, meta: { clientName: string; vehicle: string; plate: string }) {
  const title = kind === "delivery" ? "Termo de entrega do veículo (check-out)" : "Termo de devolução do veículo (check-in)";
  const items = i.items
    .map((it) => `<tr><td>${esc(it.label)}</td><td style="text-align:right">${it.ok ? "OK" : "COM AVARIA"}${it.note ? ` — ${esc(it.note)}` : ""}</td></tr>`)
    .join("");
  return page(
    `${title} — LOCAKAR`,
    `<h1>${esc(title)}</h1>
<table>
<tr><td>Locatário</td><td style="text-align:right">${esc(meta.clientName)}</td></tr>
<tr><td>Veículo</td><td style="text-align:right">${esc(meta.vehicle)} · ${esc(meta.plate)}</td></tr>
<tr><td>Data e hora</td><td style="text-align:right">${when(i.at)}</td></tr>
<tr><td>Quilometragem</td><td style="text-align:right">${formatNumber(i.km)} km</td></tr>
<tr><td>Combustível</td><td style="text-align:right">${FUEL_LABEL[i.fuel]}</td></tr>
${i.extraCharges ? `<tr><td>Valores adicionais</td><td style="text-align:right">${formatCurrency(i.extraCharges)}</td></tr>` : ""}
</table>
<h2 style="font-size:15px;margin-top:18px">Checklist</h2><table>${items}</table>
${i.damages ? `<div class="box"><strong>Avarias registradas</strong><br>${esc(i.damages)}</div>` : ""}
${i.notes ? `<div class="box"><strong>Observações</strong><br>${esc(i.notes)}</div>` : ""}
<div class="sig">
  <div><br><strong>${esc(i.staffName)}</strong><br><span class="muted">Responsável LOCAKAR</span></div>
  <div>${img(i.clientSignature)}<br><strong>${esc(i.clientName)}</strong><br><span class="muted">Locatário · assinado em ${when(i.at)}</span></div>
</div>`,
  );
}
