import type { Metadata } from "next";
import { PLATFORM } from "@/components/platform-landing/content";
import { LegalPage } from "@/components/platform-landing/legal-page";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: `Condições de uso do ${PLATFORM.name}, sistema de gestão para locadoras de veículos.`,
  alternates: { canonical: "/plataforma/termos" },
};

// ponytail: texto-base operacional; revisão jurídica antes da cobrança das mensalidades.
export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updated="2 de outubro de 2026">
      <section>
        <h2>1. O serviço</h2>
        <p>
          O {PLATFORM.name} é um sistema on-line para a gestão de locadoras de veículos: frota, clientes, reservas, locações, contratos, cobranças, financeiro,
          manutenção, multas, vistorias e aplicativo para o locatário. Cada locadora contratante tem um ambiente próprio, separado das demais.
        </p>
      </section>
      <section>
        <h2>2. Conta e acesso</h2>
        <ul>
          <li>A locadora é responsável pelos usuários que convida e pelas funções atribuídas a cada um.</li>
          <li>Senhas são pessoais. Avise-nos imediatamente se suspeitar de uso indevido.</li>
          <li>O cadastro deve conter dados verdadeiros da empresa responsável pela conta.</li>
        </ul>
      </section>
      <section>
        <h2>3. Período gratuito e planos</h2>
        <p>
          Novas locadoras têm {PLATFORM.trialDays} dias de acesso gratuito. Depois desse período, o uso depende da contratação de um plano, cujos valores e condições serão
          informados antes de qualquer cobrança. Sem contratação, a conta pode ser suspensa; os dados não são apagados automaticamente.
        </p>
      </section>
      <section>
        <h2>4. Dados da locadora e dos locatários</h2>
        <p>
          A locadora é a controladora dos dados dos seus clientes e decide como usá-los. O {PLATFORM.name} trata esses dados apenas para operar o sistema, conforme a{" "}
          <a href="/plataforma/privacidade" className="pl-link">
            Política de Privacidade
          </a>
          .
        </p>
      </section>
      <section>
        <h2>5. Contratos e integrações</h2>
        <ul>
          <li>Os modelos de contrato são da locadora, que responde pelo seu conteúdo jurídico.</li>
          <li>Integrações (Asaas, InfinitePay, PIX, Tabela FIPE, WhatsApp) são opcionais e seguem também os termos de cada fornecedor.</li>
          <li>Valores da Tabela FIPE são referência de mercado, não preço de venda.</li>
        </ul>
      </section>
      <section>
        <h2>6. Uso adequado</h2>
        <p>É proibido usar o sistema para fins ilícitos, tentar acessar dados de outras locadoras ou comprometer a segurança e a disponibilidade do serviço.</p>
      </section>
      <section>
        <h2>7. Contato</h2>
        <p>Dúvidas sobre estes termos: WhatsApp {PLATFORM.whatsapp.display}.</p>
      </section>
    </LegalPage>
  );
}
