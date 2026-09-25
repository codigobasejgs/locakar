# LOCAKAR — Locadora de Veículos

Frontend oficial da LOCAKAR: Landing Page cinematográfica + painel administrativo completo.
**Somente frontend** — dados em `localStorage`, arquitetura pronta para Supabase.

- Site: **www.locakar.com.br**
- WhatsApp: **(19) 99861-5873** — `https://wa.me/5519998615873`
- Instagram: **@locakar** — `https://www.instagram.com/locakar`

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind CSS 4 · primitivas no padrão shadcn/ui (Radix + CVA) · Lucide · Motion · Recharts · Sonner.

## Comandos

```bash
npm install        # dependências
npm run dev        # desenvolvimento em http://localhost:3000
npm run build      # build de produção
npm run start      # servir o build
npm run lint       # ESLint
npm run check      # autoverificação da lógica (CPF, placa, conflitos de reserva, WhatsApp)
```

Node.js ≥ 20.9.

## Deploy (GitHub → Vercel)

1. `git init && git add . && git commit -m "LOCAKAR frontend"` e publique no GitHub.
2. Na Vercel: **Add New → Project →** importe o repositório. Framework detectado: Next.js. Sem variáveis de ambiente.
3. Em **Domains**, aponte `www.locakar.com.br`.

Os arquivos brutos fornecidos na raiz (`*.xlsx`, `*.mp4`, `*.jpg`, `*.ogg`) estão no `.gitignore`: a planilha contém dados pessoais reais e não deve ir para o repositório. Os assets usados pelo site já estão em `public/`.

## Estrutura

```
src/
  app/
    page.tsx                  Landing Page
    manifest.webmanifest/     Manifest do app do site
    offline/                  Página offline (fallback do service worker)
    contato/                  /contato → WhatsApp (atalho do app)
    layout.tsx                SEO, fontes, OpenGraph
    icon.png / apple-icon.png / opengraph-image.jpg   (gerados do logo real)
    admin/
      layout.tsx              Shell do painel (sidebar, alertas, dados)
      page.tsx                Dashboard
      login/ vehicles/ clients/ rentals/ rentals/[id]/ reservations/
      expenses/ maintenance/ fines/ notes/ finance/ reports/ settings/
  components/
    pwa/                      Registro do SW, avisos, botão Instalar
    landing/                  Header, Hero, Frota, seções, footer, vídeo de fundo
    admin/                    Shell, DataTable, gráficos, formulários
    layout/                   MotionProvider (prefers-reduced-motion)
    ui/                       Button, Badge, Card, Dialog, Form, Logo, ícone WhatsApp
  data/
    fleet.ts                  Modelos exibidos no site (Mobi e Kwid)
    mock/                     Dados de demonstração 100% fictícios
  hooks/                      useAdminData, useCrud, usePwa (instalação, online, SW)
  lib/
    company.ts                Nome, WhatsApp, site, SEO — fonte única
    whatsapp.ts               getWhatsAppUrl(message?)
    pwa.ts                    Nomes dos apps, cores, splash screens iOS
    constants.ts              Rotas, status, listas, cores de gráfico
    analytics.ts              Indicadores, séries mensais, alertas, CSV
    reservations.ts           Detecção de conflito de período por veículo
    auth.ts                   Contrato de autenticação (demo)
    storage.ts / utils.ts     localStorage seguro, formatação, máscaras
  repositories/               Interfaces + LocalStorageRepository
  types/                      Modelos de domínio
public/
  logos/  vehicles/  images/  video/
  icons/  splash/  screenshots/  sw.js
scripts/check.ts              Autoverificação sem framework de testes
scripts/generate-pwa-assets.py  Gera ícones e splash screens a partir do logo
```

## Assets

| Arquivo | Origem |
|---|---|
| `public/video/locakar-3D.mp4` | `locakar-3D.mp4` (vídeo principal, fundo da Landing) |
| `public/images/hero-poster.jpg` | Frame real do vídeo 3D (fallback sem autoplay) |
| `public/logos/locakar-logo.png` | Logo principal, fundo removido, cores originais |
| `public/logos/locakar-logo-light.png` | Mesmo logo com as letras pretas em branco, para fundo escuro (como no próprio vídeo institucional) |
| `public/logos/locakar-circular.png` | Selo circular com recorte transparente |
| `public/vehicles/fiat-mobi.jpg` / `renault-kwid.jpg` | Fotos fornecidas |

### Vídeo

Camada `.video-background` (`position: fixed`, `z-index: 0`, `object-fit: cover`) atrás de toda a Landing, com overlay em gradiente, vinheta, glow roxo e grão sutil. `autoplay muted loop playsInline preload="metadata"` + `poster`. Com `prefers-reduced-motion` o vídeo fica pausado no poster. No mobile o overlay é mais escuro para leitura. O vídeo tem 1,8 MB — não há versão mobile separada; se trocar por um arquivo maior, gere uma versão otimizada e use `<source media>`.

## PWA (app instalável)

São **dois apps instaláveis**, cada um com manifest, ícone e escopo próprios:

| App | Manifest | Escopo | Ícone |
|---|---|---|---|
| **LOCAKAR** (site) | `/manifest.webmanifest` | `/` | selo circular |
| **LOCAKAR Gestão** (sistema) | `/admin/manifest.webmanifest` | `/admin` | logotipo |

| Plataforma | Como instala |
|---|---|
| Android (Chrome, Edge, Samsung Internet) | Botão **Instalar app** (prompt nativo) ou menu do navegador |
| Windows / macOS / Linux / ChromeOS (Chrome, Edge) | Botão **Instalar app** ou ícone de instalar na barra de endereço; abre em janela própria |
| iPhone / iPad (Safari) | Botão **Instalar app** mostra o passo a passo: Compartilhar → Adicionar à Tela de Início |
| macOS Safari 17+ | Arquivo → Adicionar ao Dock |

Recursos:
- **Service worker** (`public/sw.js`): páginas em network-first com fallback para cache e `/offline`; `/_next/static` em cache-first; imagens e fontes em stale-while-revalidate; o vídeo sempre vem da rede.
- **Offline**: site e painel abrem sem internet (o painel funciona inteiro, porque os dados estão no `localStorage`). Aparece um aviso "Sem conexão".
- **Atualização**: quando há deploy novo, aparece "Nova versão disponível → Atualizar". Ao mudar a lógica do `sw.js`, incremente `VERSION`.
- **iOS**: 25 splash screens (iPhone SE até 16 Pro Max, todos os iPads em retrato e paisagem), status bar translúcida, `viewport-fit=cover` e margens de safe-area (notch, Dynamic Island, home indicator).
- **Atalhos** do ícone (pressionar e segurar / botão direito): Frota e WhatsApp no site; Locações, Reservas, Veículos e Financeiro na gestão.
- **Badge**: o ícone do app de gestão mostra o número de alertas (Chrome/Edge e iOS 16.4+).
- **Desktop**: `window-controls-overlay` para visual de app nativo.

Regerar ícones e splash após trocar o logo: `python scripts/generate-pwa-assets.py` (requer Pillow). O `npm run check` confirma que todos os arquivos existem.

> O PWA exige **HTTPS** (a Vercel já fornece). Em `localhost` funciona para teste; o service worker só é registrado no build de produção (`npm run build && npm run start`).

## Admin

- Acesso discreto: **Ctrl + Shift + A** ou a engrenagem pequena no rodapé.
- **Isto não é segurança.** `/admin` está aberto até a integração com Supabase Auth.
- Módulos espelham as abas da planilha: VEÍCULOS, CLIENTES, LOCAÇÃO, RESERVA DE CARROS, DESPESAS, MANUTENÇÃO FROTA, MULTAS, ANOTAÇÕES (e as listas de validação de FORMULA (DADOS)).
- Recursos: busca, filtros, ordenação, paginação, criar/editar/visualizar/excluir, máscaras (CPF, telefone, placa), CPF oculto nas listagens, conflito de reservas/locações, recebimentos semanais, alertas de vencimento (multas, CNH, IPVA/licenciamento, manutenção, recebimentos), relatórios com exportação CSV e impressão.

## Dados mock e localStorage

- Na primeira abertura do painel, cada coleção é populada com dados fictícios (`src/data/mock`), com datas relativas ao dia atual.
- Tudo persiste em `localStorage` com prefixo `locakar:v1:` — apenas no navegador atual.
- **Configurações → Restaurar dados** limpa e recria a base de demonstração.

## Integração futura com Supabase

A UI só conhece a interface `Repository<T>` (`src/repositories/types.ts`):

```ts
interface Repository<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(item: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

Passos:

1. `npm i @supabase/supabase-js @supabase/ssr` e variáveis `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` na Vercel.
2. Criar tabelas a partir de `src/types/index.ts` (recebimentos de `Rental.receipts` podem virar tabela `rental_receipts`).
3. Implementar `SupabaseRepository<T>` e trocar as instâncias em `src/repositories/index.ts` — nenhum componente muda.
4. Implementar `authService` (`src/lib/auth.ts`) com `supabase.auth`, proteger `/admin` em `src/proxy.ts` e ativar **Row Level Security** em todas as tabelas.

## O que não foi inventado

Nenhum depoimento, avaliação, número de clientes/veículos, tempo de mercado, prêmio, preço ou dado legal aparece no site. Diárias não são exibidas publicamente — o preço é consultado via WhatsApp. As especificações dos cards (transmissão, combustível, lugares, ar) são de fábrica das versões de entrada e estão em `src/data/fleet.ts` para revisão.

## Pendências conhecidas

- Os três áudios fornecidos (`.ogg`) **não foram transcritos**: o ambiente de desenvolvimento não tinha ferramenta de transcrição disponível. Se contiverem requisitos, revisar e ajustar.
- `/admin` sem autenticação real (ver acima).
