# Tour guiado interativo

Treinamento sobre a interface **real** do painel: escurece a tela, destaca o elemento e explica em linguagem de quem trabalha na locadora. Complementa a Central de Ajuda (artigos, screenshots, FAQ) sem substituí-la.

## Onde aparece

| Entrada | Comportamento |
|---|---|
| Primeiro acesso (dono/administrador, locadora sem veículos e sem locações) | "Sua plataforma está pronta": **Conhecer meu sistema**, **Configurar minha locadora**, **Agora não**. Aparece uma vez. |
| Primeira visita a uma tela com tour | Cartão discreto no canto: "Quer aprender a usar esta área?" com **Tour rápido** / **Treinamento completo**. Aparece uma vez por tela. |
| Botão **Ajuda** no topo (todas as telas) | Tour da tela (começar, continuar do passo onde parou ou refazer), guias e FAQ. |
| Central > **Aprenda a usar o sistema** | Continuar aprendendo, jornadas e tours por área, com status e % concluído. |
| Central > categoria ou trilha | "Tours guiados nesta área" ao lado dos artigos. |
| Busca da Central | Resultados de tours aparecem antes dos guias ("cadastrar carro" leva ao tour de Veículos). |
| Dashboard > Primeiros passos | Botão "Aprender como" (ícone de capelo) em cada item pendente. |

## Catálogo (30 tours, 165 passos)

**Geral:** Conheça seu sistema (19 passos; adapta ao papel e ao plano).

**Jornadas por objetivo:** Prepare sua locadora · Como cadastrar sua frota · Como fazer sua primeira locação · Como receber de um locatário · Como receber um veículo de volta.

**Módulos (tour rápido + treinamento completo):** Dashboard · Solicitações · Locações (com capítulos: tela, criação, contrato, pagamento, finalização) · Reservas · Veículos (capítulos: tela, cadastro, fotos e documento) · Rastreamento · Clientes · Pagamentos · Financeiro · Despesas · Manutenção · Multas · Anotações · App do locatário · Segurança · Relatórios.

**Configurações (um subtour por aba):** Empresa · Aparência e marca · Equipe · Textos · Contratos · Pagamentos (PIX, InfinitePay, Asaas, configurado × ativo) · Integrações (FIPE, rastreamento, WhatsApp, e-mail) · Preferências e notificações.

Não há tour de "White Label", "Segurança" ou "E-mail" em Configurações como abas separadas porque não existem como abas: marca fica em Aparência, e-mail em Integrações, e a tela Segurança tem tour próprio.

## Regras de segurança do tour

- **Observacional.** O tour só clica em controles que **abrem**: formulário vazio ("Novo…"), aba, detalhes, menu do celular. Nunca salva, exclui, aprova, cobra, envia, cancela ou finaliza. O teste `check-tours` falha se um passo tentar clicar em outra coisa.
- Formulários abertos pelo tour são fechados ao avançar para um passo fora dele, ao concluir e ao sair.
- O E2E confirma que nenhum dado operacional é gravado durante os tours (só progresso e eventos do próprio tour).
- Ações com efeito real são **explicadas** ("Não vamos aprovar nada neste treinamento").

## Arquitetura

| Peça | Arquivo |
|---|---|
| Tipos (`TourDef`, `TourStep`) | `src/help/types.ts` |
| Conteúdo (dados, sem JSX) | `src/help/content/tours/{geral,jornadas,operacao,configuracoes}.ts` |
| Registro + vídeos | `src/help/content/tours/index.ts` (carregado sob demanda) |
| Regras: permissão, plano, modo rápido, rotas, busca | `src/help/tours.ts` |
| Progresso (puro, testável) | `src/help/tour-progress.ts` |
| Motor: navegação entre telas, alvo, rolagem, telemetria | `src/help/components/tour-provider.tsx` |
| Destaque e balão | `src/help/components/tour-overlay.tsx` |
| "Quer continuar depois?" e conclusão/avaliação | `src/help/components/tour-dialogs.tsx` |
| Boas-vindas e convite por tela | `src/help/components/tour-invites.tsx` |
| Cartões e linhas da Central | `src/help/components/tour-catalog.tsx` |
| Janelas não modais durante o tour | `src/lib/tour-flag.ts` + `src/components/ui/dialog.tsx` |

Sem biblioteca nova: Driver.js/Joyride/Shepherd foram avaliadas, mas o projeto já tem Radix, tokens de tema e roteamento próprio. A engine própria (~400 linhas) navega entre rotas do App Router, abre formulários com segurança e respeita white label sem CSS de terceiros.

### Alvos estáveis (`data-tour`)

Nada de `nth-child`. Os componentes compartilhados aceitam a prop `tour` e geram alvos semânticos sem mudar layout:

- `PageHeader tour="x"` → `x-header`, `x-actions`
- `DataTable tour="x"` → `x-table`, `x-search`, `x-filters`, `x-row-actions`, `x-view`
- `CardHeader tour="x"`, `FormDialog tour="x"` → `x`
- Menu lateral → `nav-<rota>`; abas de Configurações → `settings-tab-<aba>`

Alvos por tela: Dashboard (`dashboard-onboarding`, `-period`, `-kpis-fleet`, `-kpis-finance`, `-vehicles`, `-charts`, `-alerts`, `-upcoming`) · Solicitações (`requests-kpis`, `-filters`, `-list`, `-open`, `-decision`) · Locações (`rentals-new`, `-kpis`, `-form`, `-form-billing`; detalhes `rental-detail-kpis`, `-contract-data`, `-installments`, `-contract`, `-inspections`) · Reservas (`reservations-view`, `-new`, `-form`) · Veículos (`vehicles-new`, `-form`, `-form-crlv`, `-form-fipe`, `-form-photos`, `-form-document`) · Rastreamento (`monitoring-status`, `-tabs`) · Clientes (`clients-new`, `-form-identity`, `-form-cnh`, `-form-contacts`, `-form-address`) · Pagamentos (`payments-kpis`, `-filters`, `-list`, `payments-card-actions`) · Financeiro (`finance-receipts`, `-kpis`, `-charts`, `-pending`) · Despesas/Manutenção/Multas (`*-new`, `*-kpis`, `*-form`, `fines-alerts`) · Anotações (`notes-new`, `-filters`, `-timeline`, `-form`) · App do locatário (`incidents-tabs`, `-list`, `-documents`, `incidents-tab-*`) · Segurança (`security-kpis`, `-risk`, `-devices`, `-audit`) · Relatórios (`reports-types`, `-filters`, `-chart`, `-table`) · Configurações (`settings-tabs`, `-share`, `-company`, `-branding`, `-theme`, `-team`, `-texts`, `-contract-templates`, `-contract-signer`, `-payment-methods`, `-pix`, `-infinitepay`, `-asaas`, `-fipe`, `-selsyn`, `-whatsapp`, `-email`, `-alerts`, `-push`) · Topo (`topbar-help`, `topbar-bell`, `nav-open-menu`).

### Alvo ausente, fora da tela, menu fechado

- Passo `optional` sem alvo (lista vazia, card condicional) é pulado no sentido em que a pessoa ia.
- Passo obrigatório sem alvo vira explicação centralizada; em desenvolvimento o console mostra `TourTargetNotFound: <alvo> (<tour>/<passo>)`. Em produção nada técnico aparece.
- O alvo é rolado para o centro e o balão se reposiciona em rolagem, redimensionamento e mudança de layout.
- Item do menu com o menu lateral escondido (celular/tablet): o tour abre o menu.
- Rota com parâmetro (detalhes da locação): o tour vai à lista e abre o primeiro item pelo botão "Visualizar".

## Progresso, retomada e versões

- Chave: **usuário + locadora + tour**, com a versão do tour no registro. Trocar de conta ou locadora encerra o tour e recarrega o progresso certo.
- Guardado no aparelho (instantâneo, funciona sem rede) e na tabela `tour_progress` (outros aparelhos). Vence o registro mais recente.
- Fechar (×, Esc) pergunta **Continuar agora / Salvar e sair / Não mostrar mais**. Sair da tela pelo menu pausa automaticamente.
- "Continuar treinamento" volta ao passo exato. Concluir guarda a versão em `completed_versions`: quando um tour muda (`version` +1) ele aparece como **Atualizado**, oferecido e nunca imposto, e o histórico anterior é mantido.

## Permissões, plano e white label

- Tour visível = `can(papel, tour.permission)` e módulo do plano não desligado. Passos com `permission`/`feature` próprios somem para quem não tem acesso (ex.: o operador não passa por Pagamentos nem Configurações no tour geral; plano sem rastreamento pula Rastreamento).
- Locatário não vê tours (a Central do locatário não carrega o motor).
- Textos usam `{org}`, trocado pelo nome da locadora; o teste falha se um passo citar a marca da plataforma.
- Cores, raio e sombras vêm dos tokens do tema; destaque e balão foram verificados no tema claro e no escuro.

## Banco de dados

Migration `supabase/migrations/20261015000100_guided_tours.sql` (rodar uma vez no SQL Editor; idempotente):

- `tour_progress`: PK `(user_id, organization_id, tour_id)`; RLS: cada pessoa lê e grava só o próprio progresso, e só na locadora ativa (`current_org_id()`).
- `tour_events`: `tour_started`, `tour_step_viewed`, `tour_skipped`, `tour_completed`, `tour_abandoned`, `help_opened`; só ids e número do passo, **nunca texto digitado**. Insert pela própria pessoa na própria locadora; leitura só Super Admin.
- `platform_tour_funnel()`: funil por tour/versão/passo para o Super Admin descobrir onde as pessoas abandonam.

Sem a migration o tour funciona igual (progresso só no aparelho; eventos descartados em silêncio).

## Vídeos

`TourDef.video` aponta para um id em `videos` (`src/help/content/tours/index.ts`). Hoje o mapa está vazio, então nenhum botão "Assistir vídeo" aparece. Quando a fábrica de vídeos publicar, basta incluir `{ id: url }` e o `video` no tour.

## Como manter

1. **Texto:** edite o arquivo em `src/help/content/tours/`. Até ~90 palavras por passo; o resto vai para o artigo (`article`). Explique o que é, para que serve, quando usar e o que acontece depois.
2. **Tela mudou bastante:** aumente `version` do tour. Quem concluiu vê "Atualizado".
3. **Elemento novo:** adicione `data-tour="modulo-coisa"` (ou a prop `tour` dos componentes compartilhados) e referencie em `target`.
4. Rode `npm run help:validate` (registro, alvos existentes no código, rotas reais, cliques seguros, jargão, white label, permissões, plano, progresso) e `npm run help:e2e`.
5. Futuro CMS do Super Admin: o conteúdo já é dado puro (`TourDef`), sem condições espalhadas em componentes; dá para mover para tabela sem mudar o motor.

## Testes

- `npm run help:validate` → `scripts/check-tours.ts`: registro, artigos/próximo tour existentes, microcopy, jargão, white label, cliques seguros, rotas reais, alvos `data-tour` no código, cobertura de todas as telas do menu, permissões (dono, financeiro, gerente, operador, leitura, locatário, sem papel), plano com e sem rastreamento, modo rápido, rotas herdadas e com parâmetro, busca em linguagem do cliente, progresso (pausar, retomar, concluir, pular), versões, armazenamento vazio/corrompido/bloqueado e separação por usuário e locadora, mescla aparelho × servidor.
- `npm run help:e2e` → `scripts/help/e2e-tours.cjs` (Playwright, Supabase falso, nada sai da máquina): tour geral completo; Veículos (abre e fecha o formulário sem salvar); Locações (lista, formulário e detalhes); Pagamentos; Configurações > Pagamentos; retomada (Esc, Salvar e sair, Continuar no mesmo passo); celular 390×844 (folha inferior, menu aberto pelo tour); 1024×768 claro, 768×1024 escuro, 1920×1080 claro; operador com plano sem rastreamento; convites que aparecem uma vez; e verificação de que nenhum dado operacional foi gravado. `npm run help:e2e -- 7 8` roda só cenários escolhidos.

## Checklist manual com usuário leigo

Peça a alguém que nunca usou o sistema, sem ajuda, usando só o tour, a Central e o botão Ajuda:

- [ ] Cadastrar um carro
- [ ] Cadastrar um cliente
- [ ] Criar uma reserva
- [ ] Iniciar uma locação
- [ ] Cobrar uma parcela
- [ ] Aprovar um comprovante de pagamento
- [ ] Cadastrar uma despesa
- [ ] Registrar uma manutenção
- [ ] Cadastrar uma multa
- [ ] Gerar um relatório
- [ ] Alterar a logo
- [ ] Configurar uma forma de pagamento

Anote onde a pessoa travou e ajuste o passo correspondente (o funil `platform_tour_funnel()` mostra o mesmo em escala).
