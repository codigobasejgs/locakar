import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { contractPdf } from "@/lib/pdf";
import { emailLayout, sendEmail } from "@/lib/server/email";
import { sendWhatsApp } from "@/lib/server/whatsapp";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import type { Contract } from "@/types";

/**
 * Assinatura pública do contrato pelo cliente (sem login).
 * Toda a validação acontece no banco (função sign_contract: token, CPF, validade, estado).
 * Após assinar, envia a via assinada ao cliente e à LOCAKAR.
 */
export const maxDuration = 60;

const anon = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

export async function POST(request: Request) {
  let body: { token?: string; name?: string; cpf?: string; signature?: string; selfie?: string; accepted?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (!body.accepted) return Response.json({ error: "É preciso aceitar os termos do contrato." }, { status: 422 });

  // Cloudflare (proxy) → Vercel: o IP real do cliente vem em cf-connecting-ip; sem proxy, no x-forwarded-for.
  const ip =
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "desconhecido";
  const ua = request.headers.get("user-agent") ?? "";
  const db = anon();

  const { data, error } = await db.rpc("sign_contract", {
    p_token: body.token ?? "",
    p_name: body.name ?? "",
    p_cpf: body.cpf ?? "",
    p_signature: body.signature ?? "",
    p_selfie: body.selfie ?? "",
    p_ip: ip,
    p_user_agent: ua,
  });
  if (error) {
    const known = error.code === "P0001" || error.code === "P0002";
    return Response.json({ error: known ? error.message : "Não foi possível registrar a assinatura." }, { status: known ? 422 : 500 });
  }

  // Via assinada por e-mail + confirmação por WhatsApp. Falha no envio não desfaz a assinatura (já registrada).
  const signed = data as { clientName: string; clientEmail?: string; clientPhone?: string; companyEmail?: string; id: string; rentalId: string };
  const when = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

  // Resposta imediata ao cliente; PDF + e-mail + WhatsApp seguem após a resposta (after).
  after(async () => {
    // Via assinada em PDF (sem a selfie: ela fica só com a LOCAKAR). CPF, IP e navegador já foram validados/gravados acima.
    const { data: view } = await db.rpc("contract_for_signing", { p_token: body.token });
    let pdf: { filename: string; content: Uint8Array } | undefined;
    if (view) {
      const cpf = (body.cpf ?? "").replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
      const contract = { ...(view as Contract), id: signed.id, rentalId: signed.rentalId, status: "signed", signedCpf: cpf, signedIp: ip, signedUserAgent: ua } as Contract;
      pdf = await contractPdf(contract)
        .then((content) => ({ filename: `contrato-locakar-${signed.id.slice(0, 8)}.pdf`, content }))
        .catch((e) => (console.error("geração do PDF:", e), undefined));
    }

    await sendWhatsApp(db, {
      kind: "contract_signed",
      phone: signed.clientPhone,
      contractId: signed.id,
      rentalId: signed.rentalId,
      document: pdf,
      text: [
        "✅ *Contrato assinado*",
        "",
        `Olá, ${signed.clientName.split(" ")[0]}! Recebemos sua assinatura em ${when}.`,
        pdf ? "Segue a via assinada do seu contrato em PDF." : "",
        ...(signed.clientEmail ? ["Uma cópia também foi enviada para o seu e-mail."] : []),
        "",
        "_LOCAKAR · www.locakar.com.br_",
      ]
        .filter((l, i, a) => l !== "" || a[i - 1] !== "")
        .join("\n"),
    });
    if (pdf) {
      const html = emailLayout({
        title: "Contrato assinado",
        intro: `O contrato de locação de ${signed.clientName} foi assinado eletronicamente em ${when}. A via assinada, com o certificado de assinatura, segue em anexo (PDF).`,
        footerNote: "Guarde este documento. O código SHA-256 impresso no PDF comprova que o conteúdo não foi alterado após a assinatura.",
      });
      for (const to of [signed.clientEmail, signed.companyEmail].filter(Boolean) as string[]) {
        await sendEmail(db, { kind: "contract_signed", to, subject: "Contrato de locação assinado — LOCAKAR", html, attachments: [pdf], contractId: signed.id, rentalId: signed.rentalId }).catch(
          (e) => console.error("envio da via assinada:", e),
        );
      }
    }
  });
  return Response.json({ ok: true });
}
