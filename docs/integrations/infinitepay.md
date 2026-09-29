# InfinitePay — InfiniteTap + Checkout Integrado

Fontes (consultadas em 29/09/2026):
- InfiniteTap: https://www.infinitepay.io/checkout-tap
- Checkout Integrado: https://www.infinitepay.io/checkout-documentacao

## Credenciais

| Produto | API key? | O que identifica a conta |
|---|---|---|
| InfiniteTap | **Não** ("Você não precisa gerar nenhuma chave de API") | App InfinitePay logado no celular do operador. `handle`/`doc_number` são opcionais, servem para o app recusar outra conta. |
| Checkout Integrado | **Não**: a documentação não cita nenhuma chave nem header de autenticação | `handle` (InfiniteTag, sem o `$`) no corpo do POST |

Nenhuma variável de ambiente nova. A InfiniteTag fica em **Configurações → InfinitePay**, na tabela `settings`, e não é segredo.
O webhook da InfinitePay não é assinado. A proteção fica por conta do token por cobrança descrito abaixo e do `payment_check`.

## Arquitetura (reaproveita o que já existe)

- As parcelas continuam em `rentals.receipts`, que é a fonte do Financeiro e da tela Pagamentos. Não existe um segundo financeiro.
- `payment_transactions` guarda uma linha por **tentativa** de cobrança InfinitePay.
  - O `id` (UUID) é enviado como `order_id` no Tap e como `order_nsu` no Checkout.
  - Cada tentativa liga InfinitePay → tentativa → parcela (`receipt_id`) → locação → cliente.
- A baixa é feita por `confirmPaid()` (`src/lib/server/infinitepay.ts`):
  - update condicional `status <> 'paid'`;
  - índices únicos por `transaction_nsu`, por `nsu` e por parcela paga;
  - a parcela recebe `paid`, `amountPaid`, `paymentMethod` ("InfinitePay · Pix / Cartão de Crédito 3x…") e o NSU e o comprovante em `notes`.
- Avisos: `notifyStaff` (central e Web Push da equipe), push e e-mail para o cliente, `audit_log`.
- O recibo continua sendo o recibo LOCAKAR já existente (menu "Mais" → Gerar Recibo). Ele já sai com a forma de pagamento InfinitePay.

| Arquivo | Papel |
|---|---|
| `src/lib/infinitepay.ts` | Regras puras: centavos, parcelas, deeplink, payload, parsers, decisão. Testadas em `scripts/check.ts`. |
| `src/lib/server/infinitepay.ts` | HTTP para a InfinitePay, `confirmPaid`, `reconcileCheckout` |
| `src/app/api/payments/infinitepay/route.ts` | API da equipe: `tap.start`, `tap.result`, `tap.confirm`, `checkout.create`, `checkout.check`, `checkout.whatsapp`, `cancel`, status |
| `src/app/api/webhooks/infinitepay/route.ts` | Webhook do Checkout |
| `src/app/pagamento/infinitepay/page.tsx` | `redirect_url`, página pública de retorno do cliente |
| `src/app/admin/pagamentos/infinitepay/page.tsx` | `result_url` do InfiniteTap, dentro do painel e exigindo login |
| `src/components/admin/infinitepay-dialog.tsx` | Modal "Pagamento InfinitePay" (Pagamentos → Mais → Receber com InfinitePay) |
| `src/components/admin/infinitepay-settings.tsx` | Configurações → InfinitePay |
| `supabase/migrations/20261005000000_infinitepay.sql` | Tabela `payment_transactions` e RLS |

## InfiniteTap (aproximação)

1. O operador abre o painel **no celular**, com o app InfinitePay instalado e logado.
2. Caminho: Pagamentos → Mais → Receber com InfinitePay → Aproximação → escolhe crédito/débito e as parcelas → Iniciar.
3. O servidor recalcula o valor (parcela + multa/juros), valida (mínimo 100 centavos, até 12x, parcela ≥ R$ 1,00, débito à vista), cria a tentativa e devolve o deeplink:
   `infinitepaydash://infinitetap-app?amount=…&payment_method=credit|debit&installments=…&order_id=<uuid>&result_url=https://www.locakar.com.br/admin/pagamentos/infinitepay&app_client_referrer=LOCAKAR[&handle=…&doc_number=…][&af_force_deeplink=true no iOS]`
4. O app InfinitePay volta para `result_url` com `order_id, nsu, aut, card_brand, user_id, access_id, handle, merchant_document[, warning]`.
5. O que acontece com o retorno:
   - com `warning`, sem NSU ou com handle de outra conta: `failed`;
   - caso contrário: `awaiting_confirmation`.

   **O retorno nunca marca a parcela como paga.** O InfiniteTap não tem API de consulta. A equipe confere a venda no app InfinitePay (NSU) e toca em "Confirmar e dar baixa".
6. Se o app InfinitePay não abrir em cerca de 2,5 s, o painel mostra a mensagem de instalar/configurar o app e continua usável. Sem internet, a transação nem começa.

**Deep link:** o `result_url` é uma URL https do próprio painel, e não um scheme novo. Motivos:
- funciona com o painel web/PWA, sem criar um segundo sistema de deep link;
- o app do locatário (`locakar://`) é do cliente e não tem acesso de operador.

**Vários operadores:** cada tentativa grava `operator_id` e `device`.
- Com "Aproximação só na conta da empresa" ligado, o deeplink leva `handle`/`doc_number` e o app recusa se o operador estiver logado em outra conta.
- Desligado, cada operador pode usar a própria conta InfinitePay. O `handle` e o `merchant_document` retornados ficam gravados para conciliação.

## Checkout Integrado (link Pix/cartão)

1. Caminho: Pagamentos → Mais → Receber com InfinitePay → Link de pagamento → Gerar.
2. `POST https://api.checkout.infinitepay.io/links` com `handle`, `order_nsu=<uuid>`, `items[{quantity:1, price:<centavos>, description:"Aluguel <placa> - parcela N - <período>"}]`, `redirect_url`, `webhook_url` e `customer{name,email,phone_number}`.
   - A documentação não publica o formato da resposta. O código aceita apenas uma URL `https://…infinitepay.io/…` encontrada na resposta.
   - Se a conta não tiver o checkout ativo, a API responde `external_checkout_not_enabled` (verificado) e a mensagem pede para ativar.
3. Um link aberto com o mesmo valor é reaproveitado, sem criar cobranças paralelas.
4. Ações disponíveis: Abrir, Copiar, Compartilhar e **Enviar WhatsApp**, que sai pelo WhatsApp oficial (Evolution) com a mensagem padrão.
5. Três caminhos confirmam o pagamento, e todos passam pelo `POST /payment_check` (`handle, order_nsu, transaction_nsu, slug`):
   - **Webhook** `/api/webhooks/infinitepay?o=<order_nsu>&t=<token>`:
     - valida o payload e o `order_nsu`;
     - grava `transaction_nsu`, `invoice_slug` e `receipt_url` só se o token bater;
     - responde 200 imediatamente e confirma depois com `after()` + `payment_check`.
   - **redirect_url** `/pagamento/infinitepay`: o cliente volta com `receipt_url, order_nsu, slug, capture_method, transaction_nsu`; o servidor consulta o `payment_check` antes de mostrar "confirmado".
   - **Verificar pagamento** no modal (manual).
6. Regras da decisão (`decideCheckout`):
   - `paid` exige `success && paid && amount ≥ valor cobrado`;
   - valor menor que o cobrado vira `amount_mismatch` e não dá baixa;
   - `paid_amount`, que pode incluir juros do parcelamento, fica gravado como valor recebido.

**Respostas do webhook** (a documentação pede resposta em menos de 1 s; 400 faz a InfinitePay reenviar):
- payload inválido: 400;
- `order_nsu` desconhecido: 200, para não gerar reenvio infinito;
- já pago ou `transaction_nsu` repetido: 200 e `infinitepay_webhook_duplicate`.

## Segurança

- **Parâmetros vindos do navegador:** o `rentalId` e o `receiptId` enviados pelo navegador só indicam qual parcela foi escolhida. Valor, cliente e status são lidos no banco pelo servidor.
- **Acesso:** toda a API exige equipe (`requireStaff`).
- **Tabela `payment_transactions`:**
  - RLS permite SELECT só para `is_staff()`;
  - o `webhook_token` não é concedido (grant por coluna);
  - só a service role grava.
- **Dados de cartão:** nada é armazenado. `aut`/NSU/bandeira são identificadores de transação, sem número de cartão.
- **Logs e auditoria** (`audit_log`), sem segredos: `infinitepay_payment_started / created / returned / confirmed / failed / cancelled`, `infinitepay_webhook_received / processed / duplicate`.

## Produção — checklist

1. Rodar `supabase/migrations/20261005000000_infinitepay.sql` no SQL Editor.
2. No app ou portal InfinitePay (app.infinitepay.io → Checkout externo → Configurações), **ativar o checkout externo**.
3. Em Configurações → InfinitePay:
   - ativar a integração;
   - informar a InfiniteTag;
   - escolher o modo;
   - opcional: CNPJ e trava de conta.

   Salvar.
4. Nos celulares dos operadores:
   - instalar o app InfinitePay e fazer login;
   - fazer uma venda de baixo valor (no iOS, aceitar os termos Tap to Pay da Apple);
   - abrir o painel pelo navegador desse celular.
5. Teste real: cobrança de R$ 1,00 por link (Pix), conferindo webhook, baixa, notificação e recibo. Depois, R$ 1,00 por aproximação.
6. `NEXT_PUBLIC_SITE_URL` (opcional) deve apontar para o domínio público, que é usado em `webhook_url`, `redirect_url` e `result_url`.

## Troubleshooting

| Sintoma | Causa provável |
|---|---|
| "Checkout integrado desativado na conta" | Ativar o checkout externo na InfinitePay (item 2) |
| Link criado e webhook não chega | O domínio não é público (localhost) ou há bloqueio. Use "Verificar pagamento". Status em Configurações → InfinitePay (último webhook / último erro). |
| "Pagamento ainda não confirmado" com o cliente dizendo que pagou | O `payment_check` ainda não confirma. Confira no app InfinitePay. Sem `transaction_nsu` (nem webhook nem retorno), a confirmação só pode ser feita pelo app, com baixa manual. |
| Aproximação não abre o app | App não instalado ou painel aberto no computador. O deeplink só funciona no celular. |
| Retorno com "Conta InfinitePay diferente" | Operador logado em outra conta com a trava de conta ligada |
| `amount_mismatch` | Valor pago menor que o cobrado. Não há baixa automática; resolver manualmente. |
