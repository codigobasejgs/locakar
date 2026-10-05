/**
 * Smoke manual no Sandbox da Autentique. NUNCA roda em CI nem no build.
 * Uso: AUTENTIQUE_SANDBOX_TOKEN=... SMOKE_SIGNER_EMAIL=voce@exemplo.com npm run autentique:smoke
 * Cria um documento Sandbox (sem créditos) com PDF e signatário fictícios, gera o link e consulta o status.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { AutentiqueProvider } from "../src/lib/server/signature/autentique";
import { statusFromDocument } from "../src/lib/server/signature/service";

async function main() {
  const token = process.env.AUTENTIQUE_SANDBOX_TOKEN?.trim();
  const email = process.env.SMOKE_SIGNER_EMAIL?.trim();
  if (process.env.CI) throw new Error("Smoke da Autentique não roda em CI.");
  if (!token || !email) throw new Error("Defina AUTENTIQUE_SANDBOX_TOKEN e SMOKE_SIGNER_EMAIL (e-mail de teste seu).");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  page.drawText("CONTRATO DEMO - SANDBOX - SEM VALOR", { x: 60, y: 760, size: 16, font: await pdf.embedFont(StandardFonts.HelveticaBold) });
  page.drawText("Locatário fictício. Documento de teste da integração.", { x: 60, y: 730, size: 11, font: await pdf.embedFont(StandardFonts.Helvetica) });
  const file = await pdf.save();

  const provider = new AutentiqueProvider(token);
  const me = await provider.testConnection();
  console.log("Conexão OK. Organização Autentique:", me.autentiqueOrganizationId);
  const doc = await provider.createDocument({
    name: `Contrato DEMO Sandbox ${new Date().toISOString().slice(0, 16)}`,
    file,
    filename: "contrato-demo.pdf",
    sandbox: true,
    sortable: true,
    reminder: null,
    signers: [{ role: "client", order: 1, action: "SIGN", name: "Locatário Fictício", email, phone: null, cpf: null }],
  });
  console.log("Documento Sandbox:", doc.id, "| signatários:", doc.signers.length);
  const link = await provider.createSignatureLink(doc.signers[0].publicId);
  console.log("Link de assinatura (Sandbox):", link);
  const fresh = await provider.getDocument(doc.id);
  console.log("Status interno:", statusFromDocument(fresh));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
