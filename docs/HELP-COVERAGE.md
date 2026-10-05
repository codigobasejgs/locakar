# Cobertura da Central de Ajuda

Medido em 2026-10-05 com `npm run help:audit` e `npm run help:validate` (docs 1.0, app 0.1.0). Números saem de `docs/help-inventory.json`. Recalcule antes de citar.

## Números

| Item | Quantidade |
|---|---|
| Telas inventariadas (Next + app do locatário) | 47 |
| Telas com ao menos um artigo | 42 |
| Rotas técnicas de API (não documentadas para usuário final) | 43 |
| Artigos | 49 (39 equipe, 9 locatário, 1 Super Admin) |
| Categorias / trilhas | 27 / 27 (uma trilha por categoria) |
| Passos | 206 |
| Perguntas frequentes | 51 |
| Problemas e soluções | 55 |
| Screenshots reais (WebP + manifest) | 49 (43 painel, 5 app, 1 assinatura) |
| Passos com screenshot | 53 |
| Fontes que pedem revisão (`NEEDS_REVIEW`) | 0 |
| Tours guiados | 30 (1 geral, 5 jornadas, 16 módulos, 8 subtours de Configurações) |
| Passos de tour | 165 |
| Telas operacionais do painel com tour | 18 de 18 (100%) |
| Cenários E2E do tour | 15 aprovados |

## Telas sem artigo (de propósito)

| Rota | Motivo |
|---|---|
| `/` | Landing institucional da locadora. |
| `/plataforma` | Landing comercial do SaaS. |
| `/plataforma/privacidade`, `/plataforma/termos` | Textos legais. |
| `/offline` | Aviso de PWA sem conexão. |

## O que a cobertura NÃO garante

- Cobertura é por rota: uma tela "coberta" pode ter ação secundária sem passo próprio.
- Campos, mensagens e status foram conferidos lendo o código. Não há teste automático que compare texto do artigo com a tela.
- Screenshots usam dados fictícios (`src/data/mock`) e um Supabase falso. Telas que dependem de provedores externos (Asaas, InfinitePay, Selsyn, IA de contratos) mostram o estado "desconectado".
- `contracts/sign` mostra "Contrato não encontrado" (sem contrato real no mock) e o selo do `next dev`.

## Tour guiado

Todas as telas do menu do painel têm tour: Dashboard, Solicitações, Locações (e detalhes), Reservas, Veículos, Rastreamento, Clientes, Pagamentos, Financeiro, Despesas, Manutenção, Multas, Anotações, App do locatário, Segurança, Relatórios e Configurações (8 abas). Telas do painel sem tour, de propósito: `/admin/login` (antes de entrar) e `/admin/pagamentos/infinitepay` (retorno automático do celular, coberto por artigo). Detalhes em `docs/HELP-TOURS.md`.

## Não implementado

- Atalho Ctrl/Cmd+K (não existe paleta de comandos no painel para integrar; não foi criada uma nova).
- Vídeos: o campo existe, mas nenhum vídeo foi publicado ainda.
- Manual completo em uma página / PDF (cada artigo imprime pelo navegador).
- Anotações desenhadas sobre screenshots.
- Analytics no servidor das buscas e avaliações dos **artigos** (ficam no aparelho). Os eventos e avaliações do **tour** vão para `tour_events`/`tour_progress` depois da migration.
- Assistente de IA. A busca é local e não depende de IA.
- Glossário em página própria (termos estão nos artigos e na busca por sinônimos).
