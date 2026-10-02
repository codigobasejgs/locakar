# Cobertura da Central de Ajuda

Medido em 2026-10-02 com `npm run help:audit` e `npm run help:validate` (docs 1.0, app 0.1.0). Números saem de `docs/help-inventory.json`. Recalcule antes de citar.

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

## Não implementado

- Tour guiado com destaque de elementos.
- Atalho Ctrl/Cmd+K.
- Manual completo em uma página / PDF (cada artigo imprime pelo navegador).
- Anotações desenhadas sobre screenshots.
- Analytics no servidor (buscas sem resultado, feedback). Hoje ficam só no aparelho (`localStorage`).
- Assistente de IA. A busca é local e não depende de IA.
- Glossário em página própria (termos estão nos artigos e na busca por sinônimos).
