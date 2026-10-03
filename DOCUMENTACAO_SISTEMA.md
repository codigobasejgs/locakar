# LOCAKAR — Locadora de Veículos
## Documentação Completa do Sistema · Setembro de 2026

Documento gerado a partir do código do projeto. Repositório: `codigobasejgs/locakar` (ramo `main`).

---

### Sumário
1. [Visão geral](#1-visão-geral)
2. [Site público](#2-site-público)
3. [Painel de gestão](#3-painel-de-gestão)
4. [Contratos e assinatura eletrônica](#4-contratos-e-assinatura-eletrônica)
5. [Vistorias (check-in / check-out)](#5-vistorias-check-in--check-out)
6. [Cobranças com PIX](#6-cobranças-com-pix)
7. [Avisos e canais (cliente e empresa)](#7-avisos-e-canais-cliente-e-empresa)
8. [Rotina diária (8h)](#8-rotina-diária-8h)
9. [App instalável (PWA)](#9-app-instalável-pwa)
10. [Dados e segurança](#10-dados-e-segurança)
11. [Infraestrutura e publicação](#11-infraestrutura-e-publicação)
12. [Pendências operacionais](#12-pendências-operacionais)

---

### 1. Visão geral

Três partes que conversam entre si, todas no mesmo projeto e no mesmo banco de dados:
- **Site público**: vitrine da frota, institucional e encaminhamento direto para o WhatsApp comercial.
- **Painel de gestão**: operação do dia a dia (locações, reservas, clientes, veículos, financeiro, despesas, manutenção, multas, anotações, relatórios e configurações).
- **Automações**: envio de contratos, termos de vistoria, cobranças PIX, lembretes diários e resumo às 8h.

#### Tecnologia
| Camada | O que usa |
|---|---|
| Aplicação | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Banco de dados e login | Supabase (PostgreSQL com regras de acesso por usuário — RLS) |
| Hospedagem | Vercel, com o domínio passando pela Cloudflare |
| E-mail | Resend |
| WhatsApp | Evolution API (instância `locakar`) |
| Notificação no celular | Web Push padrão do navegador (chaves VAPID), sem Firebase |
| Documentos | PDFs gerados no servidor com `pdf-lib` (sem navegador) |
| QR Code PIX | Padrão BR Code (EMV-MPM) do Banco Central, gerado com `qrcode` |

---

### 2. Site público

Página única, pensada para levar o visitante ao WhatsApp comercial.

- **Abertura (Hero):** logo circular centralizado acima da frase, frase exata *"Seu nome não define seu trabalho. Alugue mesmo negativado!"*, subtexto *"Mobilidade, praticidade e atendimento personalizado para você seguir o seu caminho."*, botões para conhecer a frota e falar no WhatsApp, sobre o vídeo cinematográfico da marca.
- **Seções:**
  - **Frota:** modelos com fotos reais, especificações de fábrica (câmbio, combustível, lugares, ar-condicionado) e botão de consulta no WhatsApp para cada modelo.
  - **Como funciona:** 4 passos objetivos (escolha, contato, combinação e retirada).
  - **Benefícios:** título *"Menos custo no aluguel, mais dinheiro no seu bolso."* e 6 diferenciais.
  - **Quem Somos:** 5 parágrafos institucionais exatos da empresa e o logo circular.
  - **Contato:** chamada final e dados oficiais.
- **Canais:** todos os botões levam ao WhatsApp `(19) 98961-5873` com mensagem pronta; ícones oficiais coloridos do WhatsApp e do Instagram (`@locakar`); botão flutuante de WhatsApp no canto inferior direito.
- **Acesso discreto ao painel:** atalho `Ctrl + Shift + A` ou a engrenagem no rodapé.
- Rota `/contato` redireciona direto para o WhatsApp oficial.
- Otimizado para buscadores e redes sociais (título, descrição, imagem de compartilhamento) e acessível no celular.
- **Princípio:** nenhum depoimento, avaliação, número de clientes ou preço foi inventado. Preços são consultados pelo WhatsApp.

---

### 3. Painel de gestão

Área administrativa em `/admin`. Protegida por login do Supabase e pela tabela `staff`: estar cadastrado no login não basta, o usuário precisa estar liberado na equipe para enxergar qualquer dado.

- **Dashboard:** indicadores do momento (locações ativas, reservas pendentes/confirmadas, faturamento do mês, despesas, manutenções próximas e multas em aberto) e gráficos operacionais.
- **Locações:** cadastro completo com período, horário, caução, km inicial e final, observações, regras de cobrança, contrato eletrônico, vistorias e histórico de avisos enviados.
- **Reservas:** agenda por veículo e período, com bloqueio de datas em conflito (duas reservas não podem usar o mesmo carro no mesmo período).
- **Veículos:** frota com placa (padrão Mercosul e antigo), marca, modelo, ano, categoria, Renavam, IPVA (valor e situação: pago, em aberto ou atrasado), mês e situação do licenciamento, status (disponível, alugado, reservado, manutenção ou vendido).
- **Clientes:** cadastro com CPF validado com dígito verificador, data da 1ª habilitação, validade da CNH, telefone, e-mail e endereço.
- **Financeiro e despesas:** receitas das locações, despesas recorrentes e avulsas (com fornecedor, categoria, data e forma de pagamento), controle do que está pago e do que está em aberto.
- **Manutenção e multas:**
  - Manutenção com data, km atual e próximo km, valor e fornecedor.
  - Multas com auto de infração, data, valor, prazo de identificação do condutor, prazo de desconto e vencimento.
- **Anotações:** linha do tempo de ocorrências por data, horário e cliente vinculado.
- **Relatórios:** filtros por período e status, com exportação das tabelas em formato CSV.
- **Configurações:** dados da empresa para contratos, chave PIX, e-mail e WhatsApp que recebem os alertas da empresa, conexão do WhatsApp das notificações (com QR Code), teste de e-mail e controle das notificações da equipe.

#### Sino do painel
Duas abas:
- **Notificações:** histórico de tudo que aconteceu na operação (nova locação, pagamento, multa, cancelamentos...), com marcação de lido/não lido e botão "Marcar todas como lidas".
- **Pendências:** alertas calculados na hora a partir dos dados (recebimentos atrasados, manutenções, CNH vencendo, multas...).
O total de pendências/não lidas aparece no ícone do app instalado no computador e no celular (Badging API).

---

### 4. Contratos e assinatura eletrônica

O contrato é gerado dentro da locação e o cliente assina pelo celular, sem precisar criar conta.

#### Como funciona
1. Na locação: **Gerar contrato** (monta o texto com dados da empresa, cliente, veículo e cobrança) e **Enviar ao cliente** (link por e-mail e WhatsApp).
2. O cliente abre `/assinar/<token>` no próprio celular, lê o contrato congelado, confirma o **CPF**, tira uma **selfie ao vivo** pela câmera e **desenha a assinatura**.
3. A confirmação na tela leva ~1,5 segundo. Em segundo plano, o servidor gera o **PDF oficial** e envia a via assinada por e-mail (cliente e empresa) e por WhatsApp.

#### Garantias de validade
- **Registro probatório:** data, hora, endereço IP real (capturado via Cloudflare com `cf-connecting-ip`), dispositivo/navegador, CPF e selfie.
- **Integridade:** o texto recebe um código SHA-256 no momento da emissão. Qualquer alteração gera outro código.
- **Imutabilidade:** contrato assinado não pode ser alterado nem apagado (regra protegida por trigger no banco).
- **PDF profissional:** cabeçalho com logo, dados organizados por seção, assinaturas das duas partes e uma página final com o **Certificado de Assinatura Eletrônica** detalhando a comprovação de autoria, integridade e a base legal (MP 2.200-2/2001 e Código Civil).
- **Privacidade (LGPD):** a selfie é dado sensível e fica guardada apenas no banco para a empresa. Nunca vai no PDF do cliente nem por e-mail.

---

### 5. Vistorias (check-in / check-out)

Registradas na página da locação com o cliente presente.

- **Entrega (check-out):** quilometragem de saída, nível de combustível, checklist de 10 itens (lataria, vidros, pneus/estepe, faróis, interior, painel, ar, CRLV, ferramentas e chaves), fotos de avarias, observações e assinatura do cliente na tela. Passa o veículo para "alugado" e a locação para "ativa".
- **Devolução (check-in):** mesma conferência na volta, com valores adicionais (combustível, avarias, limpeza) e aviso visual se o combustível voltou abaixo do nível de entrega. Passa o veículo para "disponível" e a locação para "finalizada".
- O cliente recebe o **termo em PDF** por e-mail e WhatsApp imediatamente; na entrega, acompanhado da via assinada do contrato.

---

### 6. Cobranças com PIX

Cada locação pode ter suas próprias regras de cobrança, e o cliente recebe o PIX pronto (QR Code e código copia e cola) com o valor já calculado.

#### Regras por locação (bloco Cobrança)
- **Periodicidade:** diária, semanal, quinzenal, mensal, trimestral, semestral ou anual.
- **Valor da parcela** no período escolhido.
- **Datas:** primeira cobrança e última cobrança até. As parcelas são geradas entre essas datas. Mensal, trimestral, semestral e anual mantêm o mesmo dia do mês; meses mais curtos usam o último dia (ex.: 31/01 vira 28/02).
- **Multa por atraso (%):** cobrada uma vez após a carência.
- **Juros (%):** ao dia, por semana ou ao mês (juros simples sobre períodos completos).
- **Carência:** dias após o vencimento sem multa nem juros.
- **Envio automático:** o cron das 8h cobra N dias antes, no dia do vencimento e, se atrasar, a cada 3 dias.
- Multa, juros e carência entram automaticamente no texto do contrato.
- Mudar datas ou valor recalcula as parcelas **mantendo as que já foram pagas**.

#### O que o cliente recebe
- **E-mail:** tabela com parcela, multa, juros e total, **QR Code embutido na mensagem** e o código copia e cola em destaque.
- **WhatsApp:** o **QR Code como imagem** com o resumo dos valores e, na mensagem seguinte, **apenas o código** (para tocar e copiar inteiro com um toque).
- **Celular:** notificação com valor e vencimento (se ele ativou o push).

#### Compatibilidade com os bancos
O código segue o padrão **BR Code (EMV-MPM) do Banco Central** para PIX estático com valor:
- Chave no formato oficial por tipo (celular `+55...`, CPF/CNPJ só dígitos, e-mail minúsculo, aleatória).
- Moeda real (986), valor com duas casas decimais.
- Nome do recebedor (até 25 letras) e cidade (até 15 letras) sem acentos ou caracteres especiais.
- Identificador exclusivo por parcela (`txid`) que aparece no extrato do banco.
- Dígito de conferência **CRC16-CCITT** validado contra o exemplo do manual do Banco Central.
- Sem o campo de descrição livre (campo 02), que alguns bancos rejeitam.
- Em **Configurações → PIX para cobranças** há um **QR Code de teste de R$ 1,00** para ler no app do banco e conferir antes de usar (não precisa pagar).

> **Atenção:** a baixa do pagamento é manual. O sistema não consulta o banco sozinho. Ao marcar a parcela como paga no painel, fica registrado o valor efetivamente recebido (com multa e juros do dia, se estava atrasada).

---

### 7. Avisos e canais (cliente e empresa)

Cada aviso sai por todos os canais disponíveis. Se um falhar, os outros continuam, e a operação principal nunca é desfeita.

| Quem | Notificação no celular | WhatsApp | E-mail |
|---|---|---|---|
| **Equipe** (todos da tabela `staff`) | ✅ todos os eventos | — | — |
| **Empresa** (Configurações → Alertas) | — | ✅ importantes + resumo 8h | ✅ importantes + resumo 8h |
| **Cliente** | ✅ avisos dele | ✅ avisos dele | ✅ avisos dele |

#### O que o cliente recebe
Link de assinatura, contrato assinado, termos de entrega e devolução, comprovante de pagamento, cobranças PIX, notificação de multa, confirmação de reserva, aviso de manutenção no carro dele e lembretes diários (CNH, atrasos, devolução prevista, reserva próxima). O cliente ativa as notificações no celular pela própria página do contrato, sem login.

#### O que a equipe recebe no celular (Web Push)
Nova locação, entrega, devolução, cancelamento e atraso; pagamento recebido e vencimentos; reservas; novo cliente e CNH vencendo; veículos, IPVA e licenciamento; despesas; manutenções; multas; anotações; contrato assinado. Tocar na notificação foca o painel e abre a tela correspondente.

#### O que é “importante” (vai também ao e-mail e WhatsApp da empresa)
Contrato assinado, nova locação, locação cancelada, nova reserva, reserva cancelada, pagamento recebido, nova multa e **todo evento urgente** (recebimentos atrasados, devoluções atrasadas, multas e manutenções vencidas). Vários eventos juntos viram uma mensagem só.

#### Anti-spam
- O mesmo evento nunca notifica duas vezes (chave única `dedupe_key` no banco).
- Alertas por data avisam no máximo duas vezes: quando ficam próximos e quando vencem.
- Mais de 3 avisos juntos viram um resumo só.
- Edições simples (corrigir telefone, observação) não geram aviso.
- Lembretes iguais ao cliente só se repetem após 3 dias.

---

### 8. Rotina diária (8h, horário de Brasília)

Executada automaticamente pela Vercel todos os dias (`/api/cron/alerts`, `vercel.json` às 11h UTC = 8h de Brasília).

1. **Varredura no banco:** multas (vencimento e prazo de condutor), recebimentos atrasados e que vencem hoje, despesas em aberto, manutenções, CNH, IPVA e licenciamento, contratos sem assinatura há 2+ dias, devoluções atrasadas e reservas nos próximos 3 dias.
2. **Cliente:** envia um aviso por e-mail, WhatsApp e celular com o que é dele.
3. **Cobranças com PIX:** dispara as parcelas com envio automático que vencem hoje, que estão N dias antes do vencimento ou que estão atrasadas (a cada 3 dias).
4. **Empresa:** envia o resumo diário completo por e-mail e WhatsApp (pode ser desligado em Configurações).
5. **Equipe:** registra cada alerta novo no sino e envia por Web Push.
6. **Limpeza:** apaga notificações com mais de 180 dias do histórico.

---

### 9. App instalável (PWA)

Dois aplicativos independentes, instaláveis direto pelo navegador no Android, iPhone e computador:
- **LOCAKAR**: o site comercial, com funcionamento básico mesmo sem conexão (página offline).
- **LOCAKAR Gestão**: o painel administrativo, abrindo direto em `/admin` em tela cheia, com atalhos para locações, reservas, veículos e financeiro.

Recursos:
- Telas de abertura personalizadas para todos os tamanhos de iPhone e iPad.
- Dados privados (painel e assinatura) nunca ficam em cache no aparelho.
- No iPhone/iPad, as notificações Web Push exigem que o app esteja instalado na tela de início (iOS 16.4+).

---

### 10. Dados e segurança

- **Acesso ao banco:** regras de segurança por usuário (RLS) no PostgreSQL. Visitantes anônimos não leem nem escrevem em nenhuma tabela. Apenas membros da tabela `staff` acessam o painel.
- **Página de assinatura:** acessada por token longo e aleatório. Mostra apenas o contrato daquele link, validado por função segura no banco (`contract_for_signing`).
- **Montagem das mensagens:** o servidor relê o banco com a sessão de quem gravou para compor os textos; o navegador nunca escolhe texto nem destinatário.
- **Chaves secretas:** chaves de e-mail, WhatsApp, banco de dados e a chave privada do Web Push ficam exclusivamente nas variáveis de ambiente da Vercel (marcadas como Sensitive), nunca no código e nunca no navegador.
- **Privacidade:** notificações nunca levam CPF nem telefone, apenas o nome. A selfie fica restrita ao painel (LGPD).
- **Cabeçalhos de proteção:** `nosniff`, `DENY` para iframes, e acesso à câmera permitido somente no próprio site.

---

### 11. Infraestrutura e publicação

- **Repositório:** GitHub `codigobasejgs/locakar` (ramo `main`).
- **Deploy:** a Vercel publica automaticamente a cada commit enviado ao `main`.
- **Domínio:** `www.locakar.com.br` gerenciado na Cloudflare com proxy ativo (SSL, proteção contra ataques) e encaminhado à Vercel.
- **Variáveis de ambiente necessárias na Vercel (Production):**
  - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SECRET_KEY` (usada pelo cron e pelos envios em segundo plano)
  - `RESEND_API_KEY` e `EMAIL_FROM`
  - `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`
  - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - `CRON_SECRET`
  - `ALERTS_ADMIN_EMAIL` e `ALERTS_ADMIN_WHATSAPP` (opcionais, padrão do servidor se Configurações estiver vazio)
- **Atualizações do banco (Supabase → SQL Editor):**
  1. `20260925000000_init.sql`: tabelas principais, equipe e regras de acesso.
  2. `20260926000000_contracts_inspections.sql`: contratos, assinatura e histórico de envios.
  3. `20260927000000_selfie_alerts.sql`: selfie na assinatura e controle de lembretes.
  4. `20260928000000_web_push.sql`: notificações da equipe, inscrições e sino.
  5. `20260929000000_alerts_client_push.sql`: notificações do cliente e vínculo de token.
- **Verificações automáticas:** o comando `npm run check` testa CPF, datas, conflitos de reserva, alertas diários, eventos de push, cálculo de parcelas e juros, e o código PIX completo com o exemplo oficial do Banco Central.

---

### 12. Pendências operacionais

O que falta para a operação completa do dia a dia:

1. **Dados da empresa para contratos** (bloqueia emissão): preencher razão social, CNPJ e endereço em Configurações. Representante (Marco Antonio Boggian) e foro (Indaiatuba-SP) já estão salvos.
2. **Chave PIX das cobranças** (bloqueia cobranças): cadastrar a chave em Configurações → PIX e fazer a leitura do QR de teste de R$ 1,00 no app do banco.
3. **Atualização do banco**: rodar a migration `supabase/migrations/20260929000000_alerts_client_push.sql` no SQL Editor do Supabase para liberar o push do cliente.
4. **Número do WhatsApp de envio**: hoje as mensagens saem do número pessoal `(11) 95164-5271`, não do número da LOCAKAR. Para trocar: Configurações → WhatsApp → Desconectar e ler o QR Code com o celular da empresa.
5. **Segurança das credenciais**: trocar a senha do painel (`Locakar*2026`), a chave privada VAPID e as chaves do Resend e da Evolution, pois foram compartilhadas em conversa de texto.
6. **Revisão jurídica**: as cláusulas gerais do contrato são um modelo inicial e devem ser revisadas por um advogado.
