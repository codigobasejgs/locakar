# LOCAKAR — Locadora de Veículos

Frontend oficial da LOCAKAR: Landing Page cinematográfica + painel administrativo completo.
Dados no **Supabase** (Postgres + Auth + RLS); sem configuração, roda em modo demonstração com `localStorage`.

- Site: **www.locakar.com.br**
- WhatsApp: **(19) 98961-5873** — `https://wa.me/5519989615873`
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
2. Na Vercel: **Add New → Project →** importe o repositório. Framework detectado: Next.js. Cadastre as variáveis `NEXT_PUBLIC_SUPABASE_*` (ver **Banco de dados**).
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
- O atalho é só conveniência. A proteção real é o login do Supabase + RLS (ver **Banco de dados**).
- Módulos espelham as abas da planilha: VEÍCULOS, CLIENTES, LOCAÇÃO, RESERVA DE CARROS, DESPESAS, MANUTENÇÃO FROTA, MULTAS, ANOTAÇÕES (e as listas de validação de FORMULA (DADOS)).
- Recursos: busca, filtros, ordenação, paginação, criar/editar/visualizar/excluir, máscaras (CPF, telefone, placa), CPF oculto nas listagens, conflito de reservas/locações, recebimentos semanais, alertas de vencimento (multas, CNH, IPVA/licenciamento, manutenção, recebimentos), relatórios com exportação CSV e impressão.

## Banco de dados (Supabase)

O painel escolhe a persistência pelas variáveis de ambiente:

| Variáveis `NEXT_PUBLIC_SUPABASE_*` | Comportamento |
|---|---|
| **Definidas** | Supabase: login real (Supabase Auth), `/admin` protegido, dados no Postgres com RLS |
| Ausentes | Modo demonstração: `localStorage` + dados fictícios, login visual |

### Configuração (uma vez)

1. **Variáveis**: copie `.env.example` para `.env.local` (já criado nesta máquina) e cadastre as mesmas na **Vercel → Settings → Environment Variables**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://hhqtpsqcurjwnubfoeuv.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   A chave *publishable* é pública por design (vai para o navegador); quem protege os dados é o RLS.
2. **Tabelas**: Supabase → **SQL Editor** → cole `supabase/migrations/20260925000000_init.sql` → **Run**.
3. **Desligar cadastro público**: Authentication → Sign In / Providers → **Allow new users to sign up = OFF**.
4. **Criar usuário da equipe**: Authentication → Users → **Add user** (e-mail + senha, marque *Auto Confirm User*).
5. **Liberar o usuário no painel** (SQL Editor):
   ```sql
   insert into public.staff (user_id)
   select id from auth.users where email = 'locakarveiculos@gmail.com'
   on conflict do nothing;
   ```
6. Em **Authentication → URL Configuration**, defina **Site URL** = `https://www.locakar.com.br`.

### Segurança

- **RLS** em todas as tabelas: só usuários presentes em `public.staff` leem/escrevem. Estar logado não basta; visitantes anônimos não acessam nada.
- `src/proxy.ts` renova a sessão e redireciona `/admin/*` para o login quando não há usuário válido (`getClaims`, JWT verificado).
- Restrições no banco: placa válida e única, CPF único, datas coerentes, valores ≥ 0, status válidos e **reservas sobrepostas proibidas** (constraint de exclusão).
- O service worker **não** guarda páginas do `/admin` em cache.

### Estrutura

- `src/lib/supabase/` — variáveis e cliente do navegador.
- `src/repositories/supabase.ts` — `SupabaseRepository<T>` (mesma interface do localStorage; a UI não mudou).
- `src/repositories/mapping.ts` — camelCase ↔ snake_case e mensagens de erro do Postgres.
- `src/lib/auth.ts` — login/logout/sessão e verificação de acesso (`is_staff`).
- `supabase/migrations/` — schema, índices, triggers e políticas.

A UI só conhece `Repository<T>` (`src/repositories/types.ts`); `src/repositories/index.ts` escolhe a implementação:

```ts
interface Repository<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  create(item: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}
```

### Modo demonstração (sem Supabase)

Remova as variáveis para voltar ao modo demo: dados fictícios em `src/data/mock`, salvos no `localStorage` (prefixo `locakar:v1:`). **Configurações → Restaurar dados** recria a base de exemplo.

## Contratos, vistorias e notificações

### Assinatura do contrato
Na página da locação: **Gerar contrato → Enviar ao cliente** (e-mail + WhatsApp) ou **Copiar link**. O cliente abre `/assinar/<token>` e:
1. lê o contrato (texto congelado com hash SHA-256);
2. confirma o **CPF** (tem que ser igual ao do cadastro);
3. tira uma **selfie ao vivo** pela câmera (sem opção de galeria);
4. **desenha a assinatura** e aceita os termos.

Ficam registrados selfie, assinatura, data/hora, IP (atrás do Cloudflare, via `cf-connecting-ip`) e navegador. Contrato assinado não pode ser alterado nem excluído (trigger no banco). A selfie só é vista pela equipe (painel e impressão interna); nunca vai por e-mail.

> Validade: assinatura eletrônica simples/avançada, válida entre as partes (MP 2.200-2/2001, art. 10 §2º; Lei 14.063/2020). **Não** é certificado ICP-Brasil e a selfie **não** é comparada automaticamente com documento. Para biometria facial com prova de vida e checagem na base do governo, é preciso contratar um provedor (Unico, idwall, Serpro Datavalid) — o componente `SelfieCapture` é o ponto de integração.

### Vistorias
**Registrar entrega** (check-out) e **Registrar devolução** (check-in): checklist, km, combustível, avarias, valores adicionais e assinatura do cliente. Atualizam o status da locação e do veículo e notificam o cliente com o termo.

### Canais
| Canal | Serviço | Variáveis (Vercel, só servidor) |
|---|---|---|
| E-mail | Resend | `RESEND_API_KEY`, `EMAIL_FROM` |
| WhatsApp | Evolution API | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` |

Cada aviso vai pelos dois canais quando o cliente tem e-mail e telefone válidos. Falha em um canal não impede o outro. Tudo fica no histórico (tabela `email_log`, WhatsApp com destino `whatsapp:<número>`).

| Evento | Quando | Cliente | Empresa |
|---|---|---|---|
| Link de assinatura | Botão "Enviar ao cliente" | ✅ | — |
| Contrato assinado | Automático ao assinar | ✅ | ✅ e-mail |
| Entrega / devolução | Automático ao concluir a vistoria | ✅ | — |
| Comprovante | Envelope na semana paga | ✅ | — |
| Multa | "Notificar cliente" na multa | ✅ | — |
| Reserva | "Avisar" na lista de reservas | ✅ | — |
| Manutenção | "Avisar" (se o carro está com cliente) | ✅ | — |
| Alertas diários | Automático, 8h (Brasília) | ✅ | ✅ resumo |

### Alertas automáticos (todo dia às 8h)
`/api/cron/alerts` (Vercel Cron, `vercel.json`). Verifica: multas (vencendo, vencidas, identificação do condutor), recebimentos em atraso, manutenções, CNH, IPVA/licenciamento, contratos sem assinatura há 2+ dias, devoluções atrasadas e reservas nos próximos 3 dias.
- **Cliente**: um aviso por dia com o que é dele, por e-mail e WhatsApp. O mesmo lembrete só se repete após 3 dias.
- **Empresa**: resumo completo em `ALERTS_ADMIN_EMAIL` (padrão `locakarveiculos@gmail.com`) e no WhatsApp `ALERTS_ADMIN_WHATSAPP` (padrão o número oficial).
- Requer na Vercel: `CRON_SECRET` (texto aleatório) e `SUPABASE_SECRET_KEY` (Supabase → Settings → API Keys → secret). Sem `NEXT_PUBLIC_`.

## O que não foi inventado

Nenhum depoimento, avaliação, número de clientes/veículos, tempo de mercado, prêmio, preço ou dado legal aparece no site. Diárias não são exibidas publicamente — o preço é consultado via WhatsApp. As especificações dos cards (transmissão, combustível, lugares, ar) são de fábrica das versões de entrada e estão em `src/data/fleet.ts` para revisão.

## Pendências conhecidas

- Os três áudios fornecidos (`.ogg`) **não foram transcritos**: o ambiente de desenvolvimento não tinha ferramenta de transcrição disponível. Se contiverem requisitos, revisar e ajustar.
