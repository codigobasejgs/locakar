import type { Metadata } from "next";
import { PLATFORM } from "@/components/platform-landing/content";
import { LegalPage } from "@/components/platform-landing/legal-page";

export const metadata: Metadata = {
  title: "Privacidade",
  description: `Como o ${PLATFORM.name} trata dados de locadoras e de seus locatários, conforme a LGPD.`,
  alternates: { canonical: "/plataforma/privacidade" },
};

// ponytail: texto-base alinhado ao que o sistema faz hoje; revisão jurídica antes da cobrança das mensalidades.
export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updated="2 de outubro de 2026">
      <section>
        <h2>1. Papéis (LGPD)</h2>
        <p>
          Cada locadora é a controladora dos dados dos seus clientes. O {PLATFORM.name} atua como operador: trata esses dados somente para que o sistema funcione, seguindo as
          instruções da locadora.
        </p>
      </section>
      <section>
        <h2>2. Dados tratados</h2>
        <ul>
          <li>Da locadora: dados da empresa, usuários da equipe e configurações.</li>
          <li>Dos locatários: cadastro, CNH, documentos enviados, locações, pagamentos, comprovantes, vistorias e ocorrências.</li>
          <li>Na assinatura de contrato: nome, CPF, selfie, assinatura, IP e navegador, como prova da assinatura.</li>
          <li>No aplicativo: sinais de segurança do aparelho, apenas com consentimento do locatário.</li>
        </ul>
      </section>
      <section>
        <h2>3. Separação e proteção</h2>
        <ul>
          <li>Os dados de cada locadora ficam isolados por regras de acesso no banco de dados.</li>
          <li>Documentos, comprovantes e fotos ficam em armazenamento privado, acessados por links que expiram.</li>
          <li>Credenciais de integrações são guardadas criptografadas e não são enviadas ao navegador.</li>
          <li>Ações sensíveis são registradas em trilha de auditoria.</li>
        </ul>
      </section>
      <section>
        <h2>4. Compartilhamento</h2>
        <p>
          Dados só são enviados a fornecedores necessários ao serviço contratado pela locadora — hospedagem, e-mail e as integrações que ela ativar (como Asaas, InfinitePay e
          WhatsApp). Não vendemos dados.
        </p>
      </section>
      <section>
        <h2>5. Retenção</h2>
        <p>Sinais de segurança do aplicativo: 180 dias. Registros de locação, contratos e pagamentos: pelo prazo exigido em lei. Dados não são apagados automaticamente ao fim do período gratuito.</p>
      </section>
      <section>
        <h2>6. Direitos</h2>
        <p>
          Locatários exercem seus direitos (acesso, correção, exclusão quando cabível) junto à locadora com quem contrataram. Locadoras podem falar diretamente conosco pelo
          WhatsApp {PLATFORM.whatsapp.display}.
        </p>
      </section>
    </LegalPage>
  );
}
