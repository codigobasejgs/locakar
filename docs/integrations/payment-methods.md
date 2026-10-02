# Central de meios de pagamento

## Auditoria
- Asaas já usa `asaas_config.enabled`, chaves cifradas, `payment_transactions`, webhook e fatura. Não foi recriado.
- InfinitePay já usa `settings.data.infinitepay.enabled`; InfiniteTap e Checkout preservados. Checkout exige InfiniteTag; Tap usa o app do operador.
- Pix manual já usa `settings.data.pix`, BR Code local, bucket privado `comprovantes` e `payment_receipts`. Só aprovação da equipe dá baixa. Geração do QR não gera receita.
- Equipe é autorizada por `requireStaff`/`is_staff`; o projeto não possui cargos granulares. Locatário usa token próprio e RLS por cliente.

## Fonte de verdade
`src/lib/payment-methods.ts` normaliza status; `src/lib/server/payment-methods.ts` lê as configurações existentes e valida toggles. Não existe tabela paralela de disponibilidade:
- Asaas: `asaas_config.enabled`.
- InfinitePay: `settings.data.infinitepay.enabled`.
- Pix manual: `settings.data.pix.enabled`. Ausente mantém compatibilidade com o comportamento anterior (ligado, mas só oferecido com dados válidos).

`GET /api/payments/methods` serve os cards administrativos; POST exige equipe, valida pré-requisitos e registra auditoria. O app recebe os meios pelo summary autenticado `/api/tenant/summary`, sem credenciais.

## Interface
Configurações → Pagamentos → Meios de pagamento: três switches, estado/loading, confirmação quando há cobranças/análises abertas e botões Configurar para as seções existentes. Salva imediatamente no banco.
Pagamentos → Cobrar: mostra somente meios ativos/configurados; um meio ativo abre diretamente seu fluxo. Zero meios mostra atalho para Configurações.
App: mostra Asaas/InfinitePay/Pix direto conforme backend; Pix automático e Pix com comprovante possuem rótulos distintos. Zero meios mostra estado vazio, não erro técnico. Alterações chegam na próxima atualização do summary, sem redeploy.

## Histórico e bloqueios
Desativação bloqueia criação nova, não apaga chave, configuração, IDs ou histórico.
- Webhook Asaas continua ativo; consulta/cancelamento de cobrança antiga continuam.
- InfinitePay: `checkout`/`tap.start` bloqueados; `check`/confirmação/cancelamento antigos continuam. Links Checkout já emitidos são preservados no summary mesmo desligado.
- Pix: QR/copia e cola deixam de ser enviados; backend recusa novo comprovante. Comprovante pendente ainda pode ser aprovado/rejeitado. Reenvio de comprovante antigo rejeitado continua autorizado.
- Aprovação registra origem `Pix manual`, conferente, data e auditoria, notifica o cliente e encerra eventual cobrança Asaas aberta pela integração existente. Foi adicionada confirmação visual antes da aprovação.
- Arquivos: imagem JPEG/PNG e PDF de até 7 MB, assinaturas verificadas no servidor, Storage privado existente. Seleção PDF no app usa expo-document-picker compatível com seu SDK.

## Migration
`supabase/migrations/20261009000000_payment_methods.sql`:
- RPC `set_payment_method_enabled` altera apenas o booleano no JSON, atomicamente. Execução só service_role.
- Trigger `preserve_payment_method_flags` impede o formulário geral/um client Supabase de sobrescrever switches com valores antigos.
- Bucket privado comprovantes passa a aceitar application/pdf. Não torna arquivos públicos.
- Nenhuma tabela, FK ou índice financeiro novo; RLS existentes preservadas.

## Testes
`node scripts/check-payment-methods.cjs`: oito combinações ON/OFF, requisito de configuração, preservação de chaves/dados, bloqueio de nova operação e invariantes do lifecycle.
Suítes Asaas, fluxo Asaas, Selsyn e check existentes passaram; TypeScript web/app e build passaram. Lint: zero erros; dois avisos preexistentes em scripts/check.ts (imports sem uso).
PostgreSQL isolado: migration aplicada duas vezes, RPC negada para anon/authenticated, flags independentes e formulário antigo incapaz de sobrescrevê-las.
UI administrativa real com APIs simuladas: 66 casos (switches, confirmação, seleção e estado vazio), 11 larguras em Dark/Light; sem overflow/erros JS. App web recompilado.
Não houve chamadas reais aos gateways nem teste autenticado no Supabase de produção. Os testes SQL/UI são isolados; não certificam homologação real.

| Asaas | InfinitePay | Pix manual | Novas escolhas |
|---|---|---|---|
| ON | ON | ON | Os três |
| ON | ON | OFF | Asaas e InfinitePay |
| ON | OFF | ON | Asaas e Pix |
| ON | OFF | OFF | Asaas |
| OFF | ON | ON | InfinitePay e Pix |
| OFF | ON | OFF | InfinitePay |
| OFF | OFF | ON | Pix |
| OFF | OFF | OFF | Nenhum; estado vazio |

## Ativação
Execute a migration nova no Supabase antes de usar switches Pix/InfinitePay. Configurações Asaas e variáveis existentes não mudam. Faça o deploy do código/app recompilado uma vez; depois toggles não exigem deploy.

## Arquivos
Criados: lib/payment-methods.ts, lib/server/payment-methods.ts, api/payments/methods/route.ts, components/admin/payment-methods-settings.tsx, components/admin/charge-method-dialog.tsx, scripts/check-payment-methods.ts/.cjs, migration e este documento.
Alterados: Configurações e Pagamentos Admin; AsaasSettings; InfinitePaySettings; ReceiptApprovalSection; AsaasPay e pagamentos do app; types/index.ts; repositories/supabase.ts; server/charge.ts; API Asaas config; InfinitePay Admin/app; summary; envio/aprovação de comprovantes; e-mail e cron; package/lock do app e bundle publicado.
