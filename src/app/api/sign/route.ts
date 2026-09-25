import { createClient } from "@supabase/supabase-js";
import { contractDocument } from "@/lib/documents";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import type { Contract } from "@/types";

/**
 * Assinatura pública do contrato pelo cliente (sem login).
 * Toda a validação acontece no banco (função sign_contract: token, CPF, validade, estado).
 * Após assinar, envia a via assinada ao cliente e à LOCAKAR.
 */
const anon = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

export async function POST(request: Request) {
  let body: { token?: string; name?: string; cpf?: string; signature?: string; accepted?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (!body.accepted) return Response.json({ error: "É preciso aceitar os termos do contrato." }, { status: 422 });

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "desconhecido";
  const ua = request.headers.get("user-agent") ?? "";
  const db = anon();

  const { data, error } = await db.rpc("sign_contract", {
    p_token: body.token ?? "",
    p_name: body.name ?? "",
    p_cpf: body.cpf ?? "",
    p_signature: body.signature ?? "",
    p_ip: ip,
    p_user_agent: ua,
  });
  if (error) {
    const known = error.code === "P0001" || error.code === "P0002";
    return Response.json({ error: known ? error.message : "Não foi possível registrar a assinatura." }, { status: known ? 422 : 500 });
  }

  // Via assinada por e-mail. Falha no envio não desfaz a assinatura (já registrada no banco).
  const signed = data as { clientName: string; clientEmail?: string; companyEmail?: string; id: string; rentalId: string };
  const { data: view } = await db.rpc("contract_for_signing", { p_token: body.token });
  if (view) {
    const contract = { ...(view as Contract), status: "signed" } as Contract;
    const attachment = { filename: "contrato-assinado.html", content: contractDocument(contract) };
    const html = emailLayout({
      title: "Contrato assinado",
      intro: `O contrato de locação de ${signed.clientName} foi assinado eletronicamente. A via assinada segue em anexo.`,
      footerNote: "Abra o anexo no navegador para visualizar ou salvar em PDF.",
    });
    for (const to of [signed.clientEmail, signed.companyEmail].filter(Boolean) as string[]) {
      await sendEmail(db, { kind: "contract_signed", to, subject: "Contrato de locação assinado — LOCAKAR", html, attachments: [attachment], contractId: signed.id, rentalId: signed.rentalId }).catch(
        (e) => console.error("envio da via assinada:", e),
      );
    }
  }
  return Response.json({ ok: true });
}
