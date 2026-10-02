# LOCAKAR SaaS — Arquitetura multiempresa e white label

## Visão
Uma plataforma, várias locadoras. Banco, app e deploy únicos. Cada locadora (`organizations`) fica isolada por RLS no banco, no Storage, nas integrações e na marca. A LOCAKAR é a primeira locadora (slug `locakar`), com todos os dados atuais.

```
LOCAKAR SaaS (plataforma) ── Super Admin /plataforma/admin
   ├── Locadora A  → logo/cores A · equipe A · frota/clientes/contratos A · Pix/Asaas/InfinitePay A · app com marca A
   ├── Locadora B  → ...
   └── Locadora C  → ...
```

## Fonte da verdade do tenant
| Quem | Como a locadora é definida |
|---|---|
| Equipe (painel) | `memberships` + `user_preferences.active_organization_id` → `current_org_id()` no banco |
| Locatário (app) | `clients.user_id` na locadora ativa → `current_client_id()`; header opcional `x-org: <slug>` só pede o vínculo, o banco valida |
| Webhook Asaas | `?o=<orgId>` escolhe a configuração; **o token do header autentica** contra o hash daquela locadora |
| Webhook/retorno InfinitePay | locadora do pedido interno (`payment_transactions.id`) |
| Assinatura pública | locadora do contrato (token) |
| Cron | laço sobre as locadoras ativas |

`organization_id` **nunca** vem do corpo, URL ou localStorage como autoridade.

## Camadas de isolamento
1. **RLS** em todas as tabelas da locadora: `organization_id = current_org_id()`; gravação exige `can_write()` (papel ≠ leitor e locadora não suspensa); configurações exigem `can_admin()`.
2. **Integridade**: trigger `inherit_org` herda a locadora do pai e **recusa** pai de outra locadora (ex.: cliente A + veículo B), inclusive via service role. A locadora de um registro não muda.
3. **Servidor**: rotas rodam em `scoped()`; a entrada define a locadora (`setOrg`). `serviceDb()` só existe dentro desse contexto (sem contexto lança erro) e devolve um client que filtra `select/update/delete` e carimba `insert/upsert` com a locadora (`orgDb`). Acesso global explícito: `globalDb()` (só para descobrir a locadora e dados da plataforma).
4. **Storage**: novos arquivos em `{orgId}/...`; policies conferem a locadora pelo 1º segmento (`storage_path_org`). Arquivos antigos (sem pasta de locadora) pertencem à LOCAKAR — nada foi movido.
5. **Unicidade por locadora**: placa, chassi, CPF, código do cliente, auto de multa.

## Papéis (RBAC)
`owner`, `admin` (tudo) · `manager` (operação + financeiro) · `finance` (financeiro) · `operator` (operação) · `viewer` (leitura). Matriz em `src/lib/permissions.ts`; o banco garante leitura/escrita/configuração.

## White label
- `organizations.branding`: nome exibido, cores (principal, secundária, destaque), tema, logos (bucket público `branding`, PNG/JPG/WebP ≤ 1 MB, magic bytes, **sem SVG**).
- Painel: `BrandingStyle` injeta `--theme-brand*` a partir da marca; `src/lib/contrast.ts` escolhe texto legível sobre a cor (WCAG) e avisa contraste ruim.
- E-mails, PDF do contrato, WhatsApp, push, página de assinatura e de pagamento usam `brand()` da locadora do contexto.
- App do locatário: `/api/tenant/summary` devolve `brand`, `support` e `organizations` (seletor); `/api/public/org/[slug]` dá a marca antes do login.

## Integrações (escopo)
| Integração | Escopo |
|---|---|
| Asaas | por locadora (chave cifrada + webhook com token próprio) |
| InfinitePay | por locadora (InfiniteTag em settings) |
| PIX manual | por locadora (chave em settings) |
| Contratos IA | por locadora (`contract_ai_config`) ou `GEMINI_API_KEY` da plataforma |
| FIPE | **plataforma** (token único, cache compartilhado; só Super Admin configura) |
| Selsyn | limite por locadora; chave ainda via env (integração em pausa) |
| WhatsApp | instância por locadora (`org-<slug>`; LOCAKAR mantém `EVOLUTION_INSTANCE`) |
| E-mail | remetente da plataforma (`EMAIL_FROM`) com **nome** e *reply-to* da locadora |

## Planos e teste grátis
`plans.entitlements` (módulos e limites `maxVehicles`, `maxUsers`, `maxContractTemplates`, validados por trigger) e `subscriptions` (30 dias de `trial`). O cron diário roda `expire_trials()`: trial vencido → `past_due` → `suspended` após 7 dias de carência. Suspensa = só leitura, nada é apagado. **Cobrança mensal (Asaas/InfinitePay) entra quando os valores forem definidos** — a estrutura já existe.

## Rotas novas
- `/plataforma/cadastro` — cadastro self-service (e-mail confirmado, 1 locadora por conta, limite por IP).
- `/convite/[token]` — aceite de convite (só o e-mail convidado).
- `/plataforma/admin` — Super Admin (locadoras, status, plano). Sem "entrar como empresa" nesta versão.
- `/admin/settings#empresa|aparencia|equipe|textos` — dados, marca, equipe e textos da locadora.

## Testes
- `node scripts/check-tenancy.cjs` — orgDb, serviceDb fail-closed, contexto isolado em 50 requisições concorrentes, papéis, contraste.
- `npx -p @electric-sql/pglite node scripts/sql/saas-tenancy.cjs` — migrations reais: backfill com contagens, Empresa A/B, IDOR por UUID (select/update/delete), organização forjada, mistura cliente A + veículo B, papéis, suspensão, locatário em duas locadoras, Storage, RPCs, limite de plano, trial, convites.
- Suítes existentes (`check-contracts|fipe|payment-methods|asaas|asaas-flow|selsyn`) rodam dentro de uma locadora de teste.

## Futuro (não implementado)
Domínio próprio (`organizations.custom_domain` reservado) · impersonation com motivo/auditoria/banner · app nativo com marca própria (build EAS por cliente enterprise) · cobrança SaaS.
