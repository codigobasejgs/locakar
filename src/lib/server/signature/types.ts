import "server-only";

export type SignatureEnvironment = "sandbox" | "production";
export type SignatureProcessStatus = "sending" | "awaiting_signature" | "partially_signed" | "completed" | "rejected" | "expired" | "cancelled" | "error";
export type SignerRole = "client" | "company" | "witness";

export interface SignatureSignerInput {
  role: SignerRole;
  order: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  cpf?: string | null;
  action: "SIGN" | "SIGN_AS_A_WITNESS";
}

export interface ProviderSigner {
  publicId: string;
  name: string | null;
  email: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  rejectedAt: string | null;
}

export interface ProviderDocument {
  id: string;
  name: string;
  signers: ProviderSigner[];
  signedFileUrl: string | null;
  deadlineAt: string | null;
}

export interface CreateSignatureDocument {
  name: string;
  file: Uint8Array;
  filename: string;
  sandbox: boolean;
  sortable: boolean;
  reminder: "DAILY" | "WEEKLY" | null;
  signers: SignatureSignerInput[];
}

/** Contrato do domínio LOCAKAR com o provider: nada de GraphQL fora da implementação. */
export interface SignatureProvider {
  testConnection(): Promise<{ autentiqueOrganizationId: number | null; accountName: string | null }>;
  createDocument(input: CreateSignatureDocument): Promise<ProviderDocument>;
  getDocument(id: string): Promise<ProviderDocument>;
  createSignatureLink(publicId: string): Promise<string>;
  resend(publicIds: string[]): Promise<void>;
  blockDocument(id: string, at: string): Promise<void>;
  download(url: string): Promise<Uint8Array>;
}

export type SignatureErrorCode =
  | "AUTENTIQUE_NOT_CONFIGURED"
  | "AUTENTIQUE_AUTH_ERROR"
  | "AUTENTIQUE_RATE_LIMIT"
  | "AUTENTIQUE_FILE_TOO_LARGE"
  | "AUTENTIQUE_INVALID_SIGNER"
  | "AUTENTIQUE_DOCUMENT_CREATE_FAILED"
  | "AUTENTIQUE_DOCUMENT_NOT_FOUND"
  | "AUTENTIQUE_SIGNATURE_LINK_FAILED"
  | "AUTENTIQUE_WEBHOOK_ERROR"
  | "AUTENTIQUE_DOWNLOAD_FAILED"
  | "AUTENTIQUE_UNKNOWN_ERROR";

export class SignatureError extends Error {
  constructor(public code: SignatureErrorCode, message: string, public status = 422, public retryable = false) {
    super(message);
  }
}
