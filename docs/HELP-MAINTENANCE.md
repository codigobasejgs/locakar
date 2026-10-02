# Manutenção da Central de Ajuda

A documentação vive no repositório (docs as code). Mudar texto não exige mexer em React.

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| Conteúdo (artigos, passos, campos, FAQ, problemas) | `src/help/content/*.json` |
| Tipos do conteúdo | `src/help/types.ts` |
| Catálogo, categorias e trilhas (gerados dos artigos) | `src/help/index.ts` |
| Busca (acentos, sinônimos, erros de digitação, ranking) | `src/help/search.ts` |
| Perfis, planos e ajuda por rota | `src/help/access.ts` |
| Progresso, favoritos, recentes e avaliação (no aparelho) | `src/help/progress.ts` |
| Telas | `src/help/components/*`, `src/app/admin/ajuda/**`, `src/app/ajuda/**` |
| Screenshots + manifest | `public/help/screenshots/**`, `public/help/screenshots/manifest.json` |

## Adicionar ou alterar um artigo

1. Edite o JSON do módulo em `src/help/content/`. Campos obrigatórios: `slug`, `title`, `description`, `category`, `audience` (`admin`, `tenant` ou `platform`), `permission` (de `src/lib/permissions.ts`), `keywords` (3+), `aliases`, `routes` (rotas reais), `sources` (arquivos de código que o artigo descreve), `minutes`, `steps` (2+), `updated`, `version`.
2. Descreva só o que existe no código: rótulos de botões e campos copiados da tela, mensagens de erro reais.
3. Aumente `version` e atualize `updated` quando o comportamento mudar.
4. Rode `npm run help:validate`.

Categorias e trilhas aparecem sozinhas a partir do campo `category`. Para dar nome bonito a uma categoria nova, inclua em `names` em `src/help/index.ts`.

## Quando uma tela muda

1. `npm run help:audit` gera `docs/help-inventory.json` com todas as telas, quais artigos cobrem cada uma e a impressão digital (hash) de cada arquivo.
2. Artigos cujos `sources` mudaram desde a última revisão aparecem como `NEEDS_REVIEW` no relatório.
3. Revise o texto, recapture a tela e marque como revisado: `node scripts/help/audit.cjs --reviewed`.

## Recapturar screenshots

```bash
npm run help:screenshots            # todas
npm run help:screenshots -- vehicles # só uma pasta
```

- Sobe um Supabase **falso** local com os dados fictícios de `src/data/mock` e um `next dev` isolado (porta 3199, pasta `.next-help`).
- Bloqueia qualquer acesso fora de `localhost` e remove do processo as chaves reais (Supabase service role, Resend, Evolution, Asaas, Selsyn). Nenhum dado real ou segredo entra nas imagens.
- Requer `playwright-core` (instale com `npm i -D playwright-core` ou aponte `PLAYWRIGHT_DIR`) e Chrome (`CHROME_PATH`).
- Para incluir uma tela nova, adicione uma linha em `SHOTS` no `scripts/help/screenshots.cjs` (rota, clique opcional, recorte opcional).
- Confira as imagens geradas antes de publicar.

## Testes

`npm run help:validate` roda:
- `scripts/help/validate.cjs`: esquema, slugs únicos, links entre artigos.
- `scripts/check-help.cjs`: busca em linguagem natural ("cadastrar carro", "cadastra veiculo", "onde aprovo comprovante"), perfis (viewer, locatário, Super Admin), ajuda por rota e progresso (armazenamento vazio, corrompido, bloqueado, separado por locadora).
