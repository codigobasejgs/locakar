import "server-only";
import type { CreateSignatureDocument, ProviderDocument, SignatureProvider } from "./types";

/** Provider determinístico para testes: não faz rede e permite simular assinatura/recusa. */
export class MockSignatureProvider implements SignatureProvider {
  documents = new Map<string, ProviderDocument>();
  created = 0;
  resent: string[][] = [];

  async testConnection() {
    return { autentiqueOrganizationId: 1, accountName: "Conta de teste" };
  }

  async createDocument(input: CreateSignatureDocument) {
    const id = `mock-${++this.created}`;
    const doc = {
      id,
      name: input.name,
      deadlineAt: null,
      signedFileUrl: null,
      signers: input.signers.map((s, i) => ({ publicId: `${id}-s${i + 1}`, name: s.name, email: s.email ?? null, viewedAt: null, signedAt: null, rejectedAt: null })),
    };
    this.documents.set(id, doc);
    return structuredClone(doc);
  }

  async getDocument(id: string) {
    const doc = this.documents.get(id);
    if (!doc) throw new Error("Documento não encontrado.");
    return structuredClone(doc);
  }

  async createSignatureLink(publicId: string) {
    return `https://assina.ae/${publicId}`;
  }

  async resend(publicIds: string[]) {
    this.resent.push(publicIds);
  }

  async blockDocument(id: string, at: string) {
    const doc = this.documents.get(id);
    if (doc) doc.deadlineAt = at;
  }

  async download() {
    return new TextEncoder().encode("%PDF-1.7\nmock signed\n%%EOF");
  }

  sign(id: string, index: number, at = new Date().toISOString()) {
    const signer = this.documents.get(id)?.signers[index];
    if (signer) signer.signedAt = at;
  }
}
