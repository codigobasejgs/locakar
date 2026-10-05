# Cobertura da Central de Ajuda

Medido em 2026-10-05 com `npm run help:audit` e `npm run help:validate` (docs 1.1, app 0.1.0). Números saem de `docs/help-inventory.json` e do conteúdo em `src/help/content`. Recalcule antes de citar.

## Números

| Item | Quantidade |
|---|---|
| Telas inventariadas (Next + app do locatário, sem as telas da própria ajuda) | 47 |
| Telas com ao menos um artigo | 42 (89,4%) |
| Rotas técnicas de API (não documentadas para usuário final) | 45 |
| Artigos | 51 (41 equipe, 9 locatário, 1 Super Admin) |
| Categorias / trilhas | 28 / 28 (uma trilha por categoria) |
| Passos | 214 |
| Perguntas frequentes | 54 |
| Problemas e soluções | 66 |
| Termos no glossário | 26 |
| Grupos de status (rótulos tirados das constantes das telas) | 9 |
| Screenshots reais (WebP + manifest) | 53 (47 painel, 5 app, 1 assinatura) |
| Passos com screenshot | 56 |
| Passos com marcadores numerados | 10 |
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

## O que existe

- Busca local (acentos, sinônimos, erros de digitação, ranking por campo), sem depender de IA.
- Ajuda contextual (botão Ajuda no topo, inclusive no celular) com tutoriais e FAQ da tela.
- Ctrl/Cmd+K em qualquer tela do painel.
- Glossário + significado de cada status (`/admin/ajuda/glossario`, `/ajuda/glossario`).
- Manual completo em uma página, imprimível / PDF pelo navegador (`/admin/ajuda/manual`, `/ajuda/manual`).
- Marcadores numerados sobre screenshots (overlay; imagem original intacta) e lightbox com zoom e anterior/próxima.
- "Continue de onde parou" (passo salvo por artigo) e progresso geral.
- "Novo por aqui?" + tour de 4 passos no Dashboard (dono/administrador, uma vez).
- Checklist de implantação com "Como fazer" ligado ao tutorial.
- Métricas no servidor (`help_events`): artigo visto, avaliação e buscas (com nº de resultados), sem usuário, e-mail ou IP; Super Admin vê o agregado de 30 dias.
- Assistente opcional (RAG) quando a locadora tem chave de IA (a mesma de Contratos).
- Suporte real: equipe → WhatsApp da plataforma; locatário → WhatsApp da locadora (`?org=<slug>`).

## O que a cobertura NÃO garante

- Cobertura é por rota: uma tela "coberta" pode ter ação secundária sem passo próprio.
- Campos, mensagens e status foram conferidos lendo o código. Status e glossário de status vêm das constantes da tela; o resto do texto não tem teste automático contra a tela.
- Screenshots usam dados fictícios (`src/data/mock`) e um Supabase falso. Telas de provedores externos (Asaas, InfinitePay, Selsyn, IA de contratos) aparecem "desconectadas".
- `contracts/sign` mostra "Contrato não encontrado" (sem contrato real no mock).
- Marcadores foram posicionados nas listas padrão (viewport 1440×900). Recapturar com layout diferente exige revisar `markers`.

## Tour guiado

Todas as telas do menu do painel têm tour: Dashboard, Solicitações, Locações (e detalhes), Reservas, Veículos, Rastreamento, Clientes, Pagamentos, Financeiro, Despesas, Manutenção, Multas, Anotações, App do locatário, Segurança, Relatórios e Configurações (8 abas). Telas do painel sem tour, de propósito: `/admin/login` (antes de entrar) e `/admin/pagamentos/infinitepay` (retorno automático do celular, coberto por artigo). Detalhes em `docs/HELP-TOURS.md`.

## Ainda não implementado

- Comparação visual automática de screenshots (regressão). Hoje: recapturar e conferir à mão.
- Cache offline (PWA) dos artigos.
- Painel de edição de artigos para o Super Admin: o conteúdo é versionado no repositório (docs as code).
- Vídeos: o campo `video` do tour existe, mas nenhum vídeo foi publicado ainda (nenhum botão quebrado aparece).
- Equipe na checklist de implantação: o cliente não tem fonte confiável de quantos membros existem.
