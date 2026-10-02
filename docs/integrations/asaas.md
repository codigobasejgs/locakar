# Asaas — cobranças com baixa automática

Fonte oficial: https://docs.asaas.com (autenticação, cobranças, clientes, webhooks, estornos e chargeback; consultada em 02/10/2026).

## Arquitetura

```
Painel / App Locatário
   → rotas LOCAKAR (/api/asaas/*, /api/tenant/asaas)   (equipe: requireStaff · app: token do locatário)
   → src/lib/server/asaas.ts  (único lugar com HTTP para o Asaas)
   → Asaas API v3
Asaas → POST /api/webhooks/asaas → asaas_webhook_events (event.id único) → reconciliação (GET da cobrança) → parcela
```

- Não existe financeiro paralelo: as parcelas continuam em `rentals.receipts`. Cada cobrança Asaas é uma tentativa em `payment_transactions` (`provider = 'asaas'`, `flow = 'charge'`), mesma tabela da InfinitePay.
- Asaas desativado: Pagamentos, PIX manual, WhatsApp e App Locatário funcionam como antes.
- Provider manual, InfinitePay e Asaas convivem; cada parcela registra qual pagou (`settledBy`, `paymentMethod`).

## Configuração (Configurações → Integrações → Asaas)

1. Vercel: `ASAAS_ENCRYPTION_KEY` = 32 bytes em base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Redeploy.
2. Supabase: rodar `supabase/migrations/20261008000000_asaas.sql`.
3. Escolher **Sandbox**, colar a API Key (`$aact_hmlg_…`), **Salvar chave**.
4. **Testar conexão**: valida a chave (`GET /customers`) e registra o webhook (`POST /webhooks`) com token próprio.
5. Escolher formas de pagamento/encargos/notificações e **Ativar integração**.
6. Homologar; depois repetir 3–5 em **Produção** (`$aact_prod_…`).

### Segurança da chave
- Cifrada com AES-256-GCM no servidor; o banco guarda só `v1:iv:tag:cifra` e os 4 últimos caracteres.
- Chave mestra só em variável de ambiente; trocar a chave mestra exige recadastrar as API Keys.
- `asaas_config`, `asaas_customers` e `asaas_webhook_events`: RLS ligada, sem grants para `anon`/`authenticated` — nem a equipe logada lê pelo client Supabase.
- Prefixo da chave é conferido contra o ambiente (chave de Sandbox não é salva em Produção e vice-versa).
- O navegador/app recebem só `{ enabled, environment, configured, maskedKey }`. Logs e auditoria passam por `redact()`.
- Token do webhook ≠ API Key: 48 caracteres aleatórios, só o SHA-256 fica no banco, comparação em tempo constante.

## Endpoints Asaas usados

| Uso | Endpoint |
|---|---|
| Testar conexão | `GET /v3/customers?limit=1` |
| Buscar cliente (anti-duplicidade) | `GET /v3/customers?externalReference=` · `GET /v3/customers?cpfCnpj=` |
| Criar cliente | `POST /v3/customers` |
| Criar cobrança | `POST /v3/payments` |
| Buscar cobrança por referência (timeout) | `GET /v3/payments?externalReference=` |
| Consultar/conciliar | `GET /v3/payments/{id}` |
| Alterar valor/vencimento | `PUT /v3/payments/{id}` |
| Cancelar | `DELETE /v3/payments/{id}` |
| QR Code Pix | `GET /v3/payments/{id}/pixQrCode` |
| Linha digitável | `GET /v3/payments/{id}/identificationField` |
| Webhook | `POST /v3/webhooks` · `PUT /v3/webhooks/{id}` |
| Simular pagamento (só Sandbox) | `POST /v3/sandbox/payment/{id}/confirm` |

Autenticação: header `access_token` + `User-Agent: LOCAKAR`; bases `https://api-sandbox.asaas.com/v3` e `https://api.asaas.com/v3`.

## Clientes
`asaas_customers (client_id, environment) → customer_id`. Ordem: vínculo local → `externalReference = locakar-client:<id>` → CPF/CNPJ → criação. Nunca busca por nome. Timeout na criação: busca de novo antes de qualquer nova tentativa. Envia só nome, CPF/CNPJ, e-mail, celular e endereço com CEP válido.

## Cobranças
- Pix (QR + copia e cola do endpoint oficial, não gera BR Code local), Boleto (linha digitável + PDF), Cartão (fatura hospedada — nenhum dado de cartão passa pelo LOCAKAR), Cliente escolhe (`UNDEFINED`, fatura).
- Valor e vencimento sempre do servidor. Parcela vencida: valor já com multa/juros do LOCAKAR e vencimento hoje (sem encargo em dobro).
- Multa/juros/desconto só enviados quando preenchidos (não sobrescreve padrões da conta).
- Duplicidade: índice único de cobrança ativa por parcela (duplo clique/concorrência), `externalReference = locakar-tx:<id>`, e timeout/5xx inconclusivo deixam a tentativa `started` até a conciliação provar o resultado.
- Editar valor/vencimento de parcela com cobrança aberta faz `PUT` no Asaas.

## Webhook
`POST /api/webhooks/asaas` — sem sessão; header `asaas-access-token`. Persiste `event.id` (PRIMARY KEY, `ON CONFLICT DO NOTHING`) e só então responde 200; processamento em `after()`. Eventos com falha são reprocessados a cada novo webhook (sem polling). Funciona com a integração desativada (cobranças antigas continuam conciliando).

Eventos assinados: PAYMENT_CREATED, UPDATED, CONFIRMED, RECEIVED, OVERDUE, DELETED, RESTORED, REFUNDED, PARTIALLY_REFUNDED, REFUND_IN_PROGRESS, REFUND_DENIED, RECEIVED_IN_CASH_UNDONE, CHARGEBACK_REQUESTED, CHARGEBACK_DISPUTE, AWAITING_CHARGEBACK_REVERSAL, AWAITING/APPROVED/REPROVED_BY_RISK_ANALYSIS, CREDIT_CARD_CAPTURE_REFUSED, BANK_SLIP_CANCELLED. Eventos desconhecidos/alheios ficam `ignored`.

### Semântica (decisão vem do GET atual, não do tipo/ordem do evento)
| Status Asaas | LOCAKAR |
|---|---|
| PENDING, OVERDUE, AWAITING_RISK_ANALYSIS | cobrança aberta (vencida mostrada como “Vencida”) |
| CONFIRMED (pagou, saldo não disponível) | parcela paga · status “Confirmado” |
| RECEIVED (valor disponível) | parcela paga · status “Recebido” |
| REFUND_IN_PROGRESS | continua paga |
| estorno parcial (`refunds[].status = DONE`) | continua paga · valor estornado registrado |
| REFUNDED | parcela reaberta, histórico mantido nas observações |
| CHARGEBACK_* | estado próprio “Chargeback”, parcela continua paga, equipe notificada |
| removida | cancelada só se ainda não paga |

Baixa única: atualização condicional + índice único de parcela paga. Notificação/e-mail de recibo só na transição que venceu.

## Banco (`20261008000000_asaas.sql`)
- `payment_transactions`: provider `asaas`, flow `charge`, status `refunded`/`chargeback`, colunas `environment, provider_payment_id, provider_customer_id, external_reference, billing_type, provider_status, invoice_url, bank_slip_url, due_date, refunded_cents, chargeback_status, provider_updated_at`; índices únicos `(provider, provider_payment_id)` e cobrança ativa por parcela.
- `asaas_config` (1 linha), `asaas_customers`, `asaas_webhook_events` — só service role.

## Testes
- `node scripts/check-asaas.cjs`: regras puras, cripto, transporte (header/URL/timeout/401), visão pública sem segredo, autenticação do webhook, varredura de segredos no frontend/app.
- `node scripts/check-asaas-flow.cjs`: fluxo completo com banco em memória e Asaas simulado.
- Pendente: homologação real no Sandbox (exige conta e chave Sandbox).
