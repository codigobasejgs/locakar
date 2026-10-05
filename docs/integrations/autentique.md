# Autentique — assinatura eletrônica dos contratos

Autentique é o **provider de assinatura** do contrato existente (`public.contracts`). Não há segundo sistema de contratos.
Locadora sem Autentique ativa e contratos antigos continuam no fluxo próprio (`/assinar/[token]`).

Documentação oficial: https://docs.autentique.com.br/api (GraphQL, `POST https://api.autentique.com.br/v2/graphql`, `Authorization: Bearer`).

## Implantação

1. Vercel: `SIGNATURE_ENCRYPTION_KEY` = 32 bytes base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Redeploy.
2. Supabase SQL Editor: rodar `supabase/migrations/20261017000000_autentique_signatures.sql` (idempotente).
3. Cada locadora: Configurações → Integrações → Autentique → token Sandbox → Testar conexão → segredo do webhook → e-mail do representante → Salvar e ativar.
4. Painel Autentique → Webhooks: URL `https://<domínio>/api/webhooks/autentique`, eventos de documento e assinatura, mesmo segredo.

## Fluxo

| Etapa | Onde |
|---|---|
| Enviar | `POST /api/contracts/[id]/signature {action:"send"}` (staff `operate`). PDF via `contractPdf`, SHA-256, Storage privado `contratos/{org}/contracts/{id}/signature/autentique/`. |
| Idempotência | índice único parcial: 1 processo ativo por contrato. Double-click → 409. |
| Webhook | HMAC SHA-256 do corpo bruto (`x-autentique-signature`), org resolvida pelo `provider_document_id`, `signature_events.provider_event_id` único, processamento em `after()`. |
| Reconciliação | sempre `document(id)` na Autentique; status final nunca regride. |
| Conclusão | baixa `files.signed` (somente `*.autentique.com.br`), guarda com SHA-256, marca `contracts.status = signed`. |
| Cancelar | `updateDocument(deadline_at: agora)` — `deleteDocument` não bloqueia documento parcialmente assinado. |
| App locatário | `/api/tenant/contracts` gera link exclusivo sob demanda; retorno ao app só dispara consulta. |

Enquanto houver processo ativo, o trigger `contracts_external_signature_guard` impede assinar pelo link próprio ou cancelar o contrato localmente.

## Testes

- `npm run check:signature` — offline, sem rede.
- `npm run autentique:smoke` — manual, Sandbox, dados fictícios. Exige `AUTENTIQUE_SANDBOX_TOKEN` e `SMOKE_SIGNER_EMAIL`. Bloqueado em CI.
- `SIGNATURE_PROVIDER=mock` — provider falso local (ignorado em produção).
