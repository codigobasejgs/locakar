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

## Notificações da equipe (Web Push + central)

O admin é avisado no celular e no computador (notificação nativa, mesmo com o painel fechado) e tudo fica no sino 🔔 do painel com lido/não lido.

### Como funciona
```
Evento de negócio ─► notifyStaff (src/lib/server/push.ts) ─► tabela notifications (histórico, sem duplicar)
                                                          └► web-push (VAPID) ─► public/sw.js ─► notificação ─► clique abre a tela
```
- **Painel**: toda gravação passa por `AdminDataProvider` (`src/hooks/use-admin-data.tsx`). `detectEvents` (`src/lib/push-events.ts`) identifica o evento e chama `POST /api/push { action: "event" }`. O servidor **relê o registro no banco** e monta o texto com `describeEvent` — o navegador nunca define título, texto nem destinatário.
- **Por data**: o cron diário (`/api/cron/alerts`, 8h) transforma cada alerta de `buildNotices` em notificação (`noticeToEvent`).
- **Assinatura**: `/api/sign` avisa quando o cliente assina o contrato.
- **Só `src/lib/server/push.ts` conhece a biblioteca `web-push`.** Funções: `sendPushToUser`, `sendPushToRole(db, "staff")` (o papel real do sistema é a tabela `staff`), `sendPushToAll`, `notifyStaff` (equivale ao `notifyAdmins`).

### Eventos
| Evento | Categoria | Severidade | Abre |
|---|---|---|---|
| Nova locação | Locações | info | `/admin/rentals/:id` |
| Veículo entregue / locação finalizada | Locações | success | `/admin/rentals/:id` |
| Locação cancelada | Locações | warning | `/admin/rentals/:id` |
| Locação em atraso / devolução atrasada | Locações | critical | `/admin/rentals/:id` |
| Pagamento recebido (semana marcada como paga) | Pagamentos | success | `/admin/rentals/:id` |
| Recebimento vence hoje | Pagamentos | info | `/admin/rentals/:id` |
| Recebimento em atraso | Pagamentos | critical | `/admin/rentals/:id` |
| Nova reserva / alterada / confirmada | Reservas | info · success | `/admin/reservations` |
| Reserva cancelada | Reservas | warning | `/admin/reservations` |
| Reserva nos próximos 3 dias | Reservas | info | `/admin/reservations` |
| Novo cliente (só o nome, sem CPF/telefone) | Clientes | info | `/admin/clients` |
| CNH vencendo / vencida | Documentos | warning · critical | `/admin/clients` |
| IPVA / licenciamento pendente / atrasado | Documentos | warning · critical | `/admin/vehicles` |
| Novo veículo / manutenção / indisponível / vendido | Veículos | info · warning | `/admin/vehicles` |
| Nova despesa / despesa paga | Despesas | info · success | `/admin/expenses` |
| Despesa em aberto (vencida; 7+ dias = urgente) | Despesas | warning · critical | `/admin/expenses` |
| Manutenção registrada / concluída | Manutenção | info · success | `/admin/maintenance` |
| Manutenção próxima / atrasada | Manutenção | warning · critical | `/admin/maintenance` |
| Nova multa | Multas | warning | `/admin/fines` |
| Multa paga / contestada / vencida | Multas | success · info · critical | `/admin/fines` |
| Prazo de identificação do condutor | Multas | warning · critical | `/admin/fines` |
| Contrato assinado | Contratos | success | `/admin/rentals/:id` |
| Contrato sem assinatura há 2+ dias | Contratos | warning · critical | `/admin/rentals/:id` |
| Nova anotação | Anotações | info | `/admin/notes` |

Edições triviais (corrigir telefone, observação) **não** notificam. Veículo alugado/reservado/devolvido não repete o aviso da locação/reserva.

### Quem recebe o quê (3 canais)
| | Web Push | WhatsApp | E-mail |
|---|---|---|---|
| **Equipe** (todos da tabela `staff`) | todos os eventos (preferências por categoria) | — | — |
| **Empresa** (Configurações → **Alertas para a empresa**) | — | importantes, na hora + resumo 8h | importantes, na hora + resumo 8h |
| **Cliente** | avisos dele (ativa pelo link do contrato) | avisos dele | avisos dele |

- **Importantes** (`ADMIN_ALERT_TYPES` em `src/lib/push-events.ts`): contrato assinado, nova locação, locação cancelada, nova reserva, reserva cancelada, pagamento recebido, nova multa e **todo evento urgente** (atrasos, vencidos). Vários de uma vez = um e-mail/WhatsApp só.
- **Destino da empresa**: e-mail e WhatsApp cadastrados em Configurações. Vazio = `ALERTS_ADMIN_EMAIL` / `ALERTS_ADMIN_WHATSAPP` ou os contatos oficiais.
- **Cliente**: tudo que já ia por e-mail e WhatsApp (link de assinatura, contrato assinado, entrega, devolução, comprovante, multa, reserva, manutenção e lembretes diários) também vai por push. Ele ativa em "Ativar notificações" na página do contrato (`/assinar/<token>`, sem login). A inscrição fica em `client_push_subscriptions`, vinculada pelo token (validado no banco), e o clique abre a página do contrato dele.
- Migration: `supabase/migrations/20260929000000_alerts_client_push.sql`.

### Anti-spam
- `notifications.dedupe_key` é único: o mesmo evento nunca notifica duas vezes (ex.: `rentals:<id>:created`, `alert:receipt-due:<id>:<dia>:soon`).
- Alertas por data notificam **duas vezes no máximo**: quando entram na janela ("vence em breve") e quando ficam urgentes (vencido).
- Mais de 3 notificações novas de uma vez (ex.: cron) viram **um push de resumo**; todas aparecem no sino.

### Dispositivos e falhas
- Cada pessoa pode ter vários dispositivos (`push_subscriptions`, um por navegador; `endpoint` único = upsert, sem duplicar).
- Resposta **404/410** do serviço de push = inscrição morta: só aquele dispositivo é removido. Outros erros contam em `failures`; após 5 seguidos, remove.
- Falha no push nunca desfaz a operação (a locação é salva mesmo se o push falhar).
- Logs no servidor com prefixo `[push]` (sem chaves nem dados pessoais).

### Configurar (uma vez)
1. **Supabase → SQL Editor**: rodar `supabase/migrations/20260928000000_web_push.sql`.
2. **Gerar as chaves VAPID** (uma vez; trocar invalida as inscrições): `npx web-push generate-vapid-keys`.
3. **Vercel → Environment Variables** (Production), sem `NEXT_PUBLIC_`:
   - `VAPID_PUBLIC_KEY` = chave pública
   - `VAPID_PRIVATE_KEY` = chave privada (marcar **Sensitive**; nunca no código nem no chat)
   - `VAPID_SUBJECT` = `mailto:locakarveiculos@gmail.com`
   - `SUPABASE_SECRET_KEY` (já usada pelo cron)
4. Redeploy. Em cada dispositivo: **Configurações → Notificações → Ativar notificações** → permitir → **Enviar teste**.

> iPhone/iPad: Web Push só funciona no app instalado (Compartilhar → Adicionar à Tela de Início, iOS 16.4+), aberto pelo ícone.

### Preferências
**Configurações → Notificações → Web Push para a equipe**: liga/desliga geral e por categoria (vale para toda a equipe). O sino continua registrando tudo.

### Novo evento
1. Em `detectEvents`, devolva um nome para a mudança (ex.: `"status:xyz"`).
2. Em `describeEvent`, monte `{ type, category, severity, title, body, url, dedupeKey }` com dados do registro.
3. Adicione um caso em `scripts/check.ts`.

### Testar
- `npm run check`: detecção de eventos, dedupe, preferências, resumo e remoção de inscrição 404/410 com vários dispositivos.
- No navegador: ativar em Configurações → **Enviar teste**; criar uma locação e ver o push e o sino.

## Cobranças com PIX

### Configurar (uma vez)
**Configurações → PIX para cobranças**: tipo da chave (CPF, CNPJ, celular, e-mail ou aleatória), chave, nome e cidade do recebedor. Aparece um **QR Code de teste de R$ 1,00**: leia no app do banco para conferir (não precisa pagar).

### Na locação
Em **Nova/Editar locação → Cobrança**:
- **Periodicidade**: diária, semanal, quinzenal, mensal, trimestral, semestral ou anual.
- **Valor da parcela**, **primeira cobrança** e **última cobrança até**: as parcelas são geradas entre essas datas. Mensal/trimestral/anual mantêm o dia do mês; em mês curto usa o último dia (31/01 → 28/02).
- **Multa por atraso (%)**: cobrada uma vez. **Juros (%)** ao dia, por semana ou ao mês (juros simples, períodos completos). **Carência** em dias.
- **Envio automático**: o cron das 8h manda a cobrança N dias antes, no dia do vencimento e, se atrasar, a cada 3 dias até ser paga.
- Multa, juros e carência entram no texto do contrato.
- Mudar periodicidade, datas ou valor regenera as parcelas **mantendo as já pagas**.

Na página da locação, o ícone de **QR Code** em cada parcela envia a cobrança na hora. Ao marcar como paga, fica registrado o valor efetivo (com multa/juros, se estava atrasada).

### O que o cliente recebe
- **E-mail**: tabela com parcela, multa, juros e total, **QR Code embutido** e o código copia e cola.
- **WhatsApp**: o **QR Code como imagem** com o resumo e, em seguida, **só o código** (para tocar e copiar inteiro).
- **Celular** (se ativou o push): aviso com o valor e o vencimento.

### Compatibilidade com os bancos
O código segue o padrão **BR Code (EMV-MPM) do Banco Central** para PIX estático com valor (`src/lib/billing.ts` → `pixPayload`): GUI `br.gov.bcb.pix`, chave no formato oficial por tipo (celular `+55…`, CPF/CNPJ só dígitos, e-mail minúsculo), moeda 986, valor com 2 casas, nome (até 25) e cidade (até 15) sem acento, `txid` por parcela e **CRC16-CCITT** — validado contra o exemplo do manual do BCB em `npm run check`. Sem o campo de descrição, que alguns bancos recusam.
> Sem integração bancária: o sistema não sabe sozinho quando o PIX cai. A baixa é manual (marcar a parcela como paga). O `txid` identifica a parcela no extrato.

## Central de Ajuda e Treinamento

Manual interativo dentro do produto: busca, tutoriais com screenshots reais, FAQ, trilhas com progresso, ajuda contextual e **tour guiado sobre a interface real** (30 tours: geral, jornadas, todos os módulos e as abas de Configurações).

- **Equipe:** `/admin/ajuda` (menu "Ajuda e Treinamento" e botão "Ajuda" no topo, que lista os artigos da tela aberta).
- **Locatário:** `/ajuda?org=<slug>` (botão "Central de Ajuda e Treinamento" no Perfil do app). Mostra só conteúdo do locatário.
- **Super Admin:** artigo da plataforma só aparece para quem passa em `is_platform_admin()`.

Como funciona:
- Conteúdo em JSON (`src/help/content/*.json`), separado da UI. Categorias e trilhas são geradas a partir dos artigos.
- Busca local (`src/help/search.ts`): ignora acentos, entende sinônimos ("carro" = "veículo") e erros de digitação. Sem IA e sem serviço externo.
- Permissões (`src/help/access.ts`): artigos seguem `can(role, permission)` de `src/lib/permissions.ts` e os módulos do plano.
- Progresso, favoritos, recentes e avaliação ficam no aparelho (`localStorage`, por usuário e locadora).
- Tour guiado: conteúdo em `src/help/content/tours/`, motor em `src/help/components/tour-*.tsx`, alvos `data-tour` nas telas. Só observa: abre formulários vazios para mostrar onde preencher e nunca salva. Progresso também em `tour_progress` (migration `20261015000100_guided_tours.sql`).

Comandos:

```bash
npm run help:validate     # esquema + testes de busca, perfis, rotas e progresso
npm run help:audit        # inventário de telas, cobertura e fontes alteradas → docs/help-inventory.json
npm run help:screenshots  # recaptura com dados fictícios e Supabase falso local
npm run help:e2e          # tour guiado ponta a ponta (Playwright, Supabase falso)
```

Detalhes: `docs/HELP-MAINTENANCE.md` (como adicionar artigo e recapturar), `docs/HELP-COVERAGE.md` (números medidos e limites), `docs/HELP-CENTER-MAP.md` (mapa de módulos), `docs/HELP-TOURS.md` (tour guiado).

## O que não foi inventado

Nenhum depoimento, avaliação, número de clientes/veículos, tempo de mercado, prêmio, preço ou dado legal aparece no site. Diárias não são exibidas publicamente — o preço é consultado via WhatsApp. As especificações dos cards (transmissão, combustível, lugares, ar) são de fábrica das versões de entrada e estão em `src/data/fleet.ts` para revisão.

## Pendências conhecidas

- Os três áudios fornecidos (`.ogg`) **não foram transcritos**: o ambiente de desenvolvimento não tinha ferramenta de transcrição disponível. Se contiverem requisitos, revisar e ajustar.
