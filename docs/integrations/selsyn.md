# Selsyn — Rastreamento LOCAKAR

## Fonte oficial
Arquivo OpenAPI fornecido pelo cliente: Swagger 3.0.0 / OpenAPI 3.0.1, 214 operações, 163 caminhos, 94 schemas. Referência: https://api.appselsyn.com.br/documentacao.html. A página apresentou conexão recusada/timeout; contratos extraídos do arquivo local sem chamadas autenticadas.

## Autenticação
`api-key-cliente`: apiKey **x-api-key na query**, conforme `components.securitySchemes`. O esquema de operador usa header e é outro tipo de credencial. Base: `https://api.appselsyn.com.br/keek/rest/`.

Chave lida somente de `process.env.SELSYN_API_KEY`. Não salvar em settings, frontend, app ou Git. Recomenda-se substituir a credencial exposta na conversa. Nunca registrar URL externa completa nos logs/APM: a query contém a chave por exigência do fornecedor. Transporte usa `redirect: error`, `cache: no-store`, timeout interno de 20s e limite de resposta 8MB.

## Arquitetura
Admin → endpoints LOCAKAR com `requireStaff` → client server-only → Selsyn → resposta validada/sanitizada → Admin.

Arquivos novos:
- `src/lib/selsyn-contracts.json`: catálogo extraído do OpenAPI: 53 GETs (34 Consulta, 10 Monitoramento, 9 GDR) e 41 schemas referenciados.
- `src/lib/selsyn.ts`: validação, normalização e tipos puros.
- `src/lib/server/selsyn.ts`: autorização, reserva, auditoria e respostas seguras.
- `src/lib/server/selsyn-transport.ts`: único transporte externo, testável com fetch simulado.
- `src/app/api/selsyn/status/route.ts`: status local, sem consultar fornecedor.
- `src/app/api/selsyn/fleet/route.ts`: frota da LOCAKAR (Supabase) + última posição dos veículos vinculados via `integracaoAoVivo`; falha do fornecedor volta em `providerError` sem derrubar a frota.
- `src/app/api/selsyn/link/route.ts`: confirmar/remover vínculo pelo ID rastreável informado; valida com `aovivoPorRastreavel` (read-only) e exige placa igual.
- `src/app/api/selsyn/query/[operationId]/route.ts`: catálogo fechado de consultas; não aceita URL, método ou headers fornecidos pelo navegador.
- `src/app/admin/monitoring/page.tsx`: central Rastreamento.
- `src/components/admin/{tracking-map,vehicle-tracking-panel,selsyn-result,selsyn-settings}.tsx`.
- `scripts/check-selsyn.ts` e `scripts/check-selsyn.cjs`: testes offline, sem consumo de consultas.
- `supabase/migrations/20261007000000_selsyn_tracking.sql`.

Alterados: navegação/rotas, tipos FleetVehicle, detalhes de veículos, seção informativa de Configurações, `.env.example` e dependências Leaflet. App locatário/Financeiro/pagamentos/clientes não alterados.

## Configuração
- `SELSYN_API_KEY`: secret exclusivamente backend/Vercel.
- `SELSYN_ORGANIZATION_ID`: uuid da locadora dona da chave. Sem ele (ou em outra locadora) todas as rotas Selsyn respondem `TENANT_NOT_CONFIGURED` — a chave é global e o fornecedor não conhece as locadoras.
- `SELSYN_POSITION_REFRESH_SECONDS`: 120s por padrão, mínimo interno 60s, máximo 3600s; valor efetivamente usado pela UI.
- Sem campo de chave no Admin. Configurações mostra presença da credencial, migration, intervalo e última consulta/erro.

## Persistência e segurança
Campos novos em `vehicles`: `selsyn_rastreavel_id` como texto decimal int64, `selsyn_identificador`, `selsyn_linked_at`. ID local e ID do fornecedor são distintos. Índice único impede dois veículos com o mesmo rastreável. A placa normalizada sugere o cadastro; somente a ação Vincular salva, após nova consulta validar ID/placa. Não cria veículos automaticamente.

Tabela `selsyn_requests`: somente operador, operation ID, request ID, hash de parâmetros, status, duração e horário; nenhuma telemetria/chave. RPC com advisory lock reserva atomicamente; limites internos 15/min por operador, 60/min na conta, uma em andamento por operador. IDs repetidos e pedidos equivalentes em 5s não geram nova chamada. São proteções internas, não quotas oficiais. Registros de mais de 24h são limpos na próxima reserva. Escrita/leitura restritas à service role, com RLS e RPC sem execução para anon/authenticated.

Reutiliza `audit_log`: ator/operação/vínculo/status/duração/correlation ID, sem coordenadas/resposta completa. Não replica histórico no Supabase. Permissão é a equipe existente (`staff`); locatário e anônimo não acessam. Não há comando de bloqueio, saída, acionamento, reinício ou gravação na Selsyn.

## Dados apresentados
Somente retornos oficiais: posição, velocidade, ignição, offline explícito, última comunicação/data da posição, coordenadas, bateria/fonte e unidades, GPS/satélites, dispositivo, endereço recebido e sensores. Zero/false preservados; ausentes são Não informado.

Movimento/parada derivados de velocidade disponível; offline só por flag/status do fornecedor. Não inventa totais de alertas da conta a partir de uma página limitada. Histórico GDR possui `HistoricoResultDto.posicoes`; trajeto usa coordenadas/timestamps válidos. Paradas/distância só são apresentadas quando o fornecedor retornar.

Contador de distância Selsyn é mostrado como unidade não documentada, ao lado do hodômetro LOCAKAR em km. Não sobrescreve cadastro nem oferece aplicação do valor sem confirmar unidade.

## Mapa e datas
Leaflet sob demanda com tiles OSM e atribuição visível. Sem geocoding ou download offline. Nenhuma placa/cliente/chave vai na URL dos tiles; o serviço recebe IP e tiles da região visualizada. Popups usam DOM/textContent, sem HTML recebido. Coordenadas inválidas são excluídas, zero é válido.

Data/hora local do dispositivo é convertida via Date/ISO para UTC real. Datas simples continuam yyyy-MM-dd nos endpoints que exigem esse formato. Inputs validam calendário, enums, tipos, int64 e ordem do período; não concatenam Z sobre horário local.

## Relatórios e lacunas
Formatos JSON/PDF_PORTRAIT/PDF_LANDSCAPE/XLSX/HTML só nos endpoints que os declaram. `ReportResultDto` define content: object sem propriedades, id, status (key/value/ativo), mensagem. Não documenta estrutura interna, download ou estados assíncronos. Conteúdo é mostrado como rótulos, tabelas/listas e resposta técnica sanitizada opcional.

Se retornar diretamente PDF/XLSX/HTML com MIME/assinatura compatíveis, permite baixar o arquivo original sem conversão. Esse caminho foi testado com fixtures, **não homologado com a API real**. HTML é baixado como texto sem executar scripts. URLs presentes no conteúdo não são seguidas automaticamente: sem SSRF ou vazamento de chave. Envelopes/links desconhecidos ficam explícitos; não anunciar exportação funcional sem evidência.

Sensor detalhado requer sensorId no path e query: um campo visual envia o mesmo valor nas duas posições. Unidades de odometro/distance e alguns totalizadores não são definidas. Responses só possuem default, sem códigos específicos, preço, quota temporal ou timeout oficial. `api-key-cliente` na operação comprova compatibilidade documental, não autorização efetiva desta conta. 401/403 devem aparecer, sem experimentar outra credencial.

## Testes e pendências
- `npm run check`: suíte existente.
- `node scripts/check-selsyn.cjs`: offline, requests/header/query, enums/datas/IDs, entrada e resposta inválidas, HTTP 400/401/403/404/429/500, timeout, redaction, falsy, vazio e exports com fixtures.
- APIs LOCAKAR locais sem sessão: 401 em status/fleet/link/query.
- SQL em PostgreSQL isolado: migration aplicada duas vezes, reservas, busy/duplicidade/quota, vínculo único, bloqueio roles anon/authenticated, service role e limpeza. Concorrência de múltiplas sessões e RLS completa da instância Supabase precisam de homologação autorizada.
- UI real isolada com fixtures e CSS real: 11 larguras (320–1920) em Dark/Light, sincronização e consulta de sensor; sem overflow ou erro JS. Não representa autenticação staff/persistência reais.
- Nenhuma chamada autenticada à Selsyn: credencial ausente no processo local. Fonte web indisponível. Permissões da conta, content/exportações e unidades continuam pendentes.

## Habilitar em produção
1. Execute a migration no SQL Editor do Supabase.
2. Configure chave substituída como `SELSYN_API_KEY` no backend/Vercel; redeploy.
3. Abra Rastreamento, consulte a frota autorizada uma vez e confira permissões reais de gdrAovivo.
4. Vincule uma placa autorizada, consulte posição/histórico/sensores com período curto.
5. Homologue uma exportação essencial e a estrutura de content. Não varra IDs nem dispare dezenas de consultas.

## Erros públicos
AUTHENTICATION_FAILED: fornecedor 401; PROVIDER_FORBIDDEN: fornecedor 403 (não prova, sozinho, chave válida sem permissão); PROVIDER_NOT_FOUND: 404; PROVIDER_RATE_LIMITED: 429 (retryable); PROVIDER_UNAVAILABLE: outros/5xx (5xx retryable); BACKOFF: falha transitória há menos de 60s; TENANT_NOT_CONFIGURED: chave não pertence a esta locadora; VEHICLE_SCOPE_REQUIRED: consulta sem rastreável vinculado à locadora; INVALID_CREDENTIAL_FORMAT: espaço/quebra/aspas na chave. Demais: NOT_CONFIGURED: secret ausente; DATABASE_NOT_READY: migration/RPC; DUPLICATE_REQUEST: consulta repetida/em andamento; RATE_LIMITED: quota interna/fornecedor; TIMEOUT: sem nova tentativa automática; INVALID_PROVIDER_RESPONSE: formato divergente. Logs não incluem chave, URL autenticada ou corpo da resposta.

## Auditoria 2026-10-06 (read-only)

**Fonte do contrato.** A página oficial não respondeu deste ambiente (DNS 34.49.128.194, conexão HTTPS com timeout/ECONNREFUSED). O único contrato disponível é o OpenAPI fornecido pelo cliente (resumido em `selsyn-contracts.json`, sem `servers`/`securitySchemes` e sem data/hash de origem). Por isso **URL, header e parâmetros não foram alterados**.

**Causa do 403 — o que a evidência permite afirmar.** As quatro chamadas batem com o contrato arquivado: base `/keek/rest/`, `GET`, `x-api-key` na query (`api-key-cliente`), sem parâmetros obrigatórios. Isso descarta, contra esse contrato, URL errada (A), header errado (B) e parâmetro incorreto (F). Restam chave inválida (D), chave válida sem permissão (E) ou mudança no contrato oficial atual (C/G). As responses documentadas são só `default`, então 403 não separa D de E. Conclusão: **pedir à Selsyn** confirmação do tipo/escopo da chave e permissão de leitura das operações abaixo.

| Família | operationId | GET (base /keek/rest) | Resultado relatado |
|---|---|---|---|
| Gerenciamento de Risco - V1 | gdrAovivo | /v1/integracao/gdr/posicao/aovivo | 403 |
| Monitoramento Nível Cliente - V1 | integracaoAoVivo | /v1/integracao/posicao | 403 |
| Consulta Nível Cliente - V1 | aovivo | /posicao/v2/aovivo | 403 |
| Monitoramento Nível Cliente - V1 | intergacaoListTipoAlerta | /v1/integracao/alerta/tipo | 403 |

**Correções locais (independentes do contrato).**
- 401 e 403 deixaram de ser o mesmo erro; 404/429/5xx com códigos próprios; `retryable` e metadados seguros (operação, path sem query, HTTP, content-type, request ID, duração) — nunca a chave.
- `/fleet` não depende mais de GDR e parte dos veículos da LOCAKAR; erro do fornecedor não derruba a página e desliga o auto-refresh.
- Isolamento: chave global presa a `SELSYN_ORGANIZATION_ID`; `/query` só aceita rastreável/placa vinculados à locadora; listagens globais bloqueadas.
- Migration `20261018000000_selsyn_readonly_guard.sql`: colunas de vínculo só mudam pelo backend.
- Diagnóstico: `Diagnosticar acesso Selsyn` (permissão `integrations`), orçamento de 38 s, matriz de capabilities (não testado = desconhecido), relatório sem credencial para o suporte.
- Backoff de 60 s após 429/5xx/timeout; sem retry automático em 401/403.
- `npm run selsyn:diagnose`: manual, fora de CI, com credencial **substituta** autorizada.

**Comandos físicos.** `gdrActivateOutput` e qualquer bloqueio/saída/acionamento **não estão no catálogo, não foram executados e continuam desabilitados**. O contrato desta operação não pôde ser lido (documentação oficial inacessível).

**Fora da Selsyn.** `ERR_BLOCKED_BY_CLIENT` em `static.cloudflareinsights.com` vem de bloqueador do navegador; o código não injeta esse beacon. A imagem 400 não vem do monitoramento (que não renderiza imagens); provável Next/Image com URL externa de veículo sem `images.remotePatterns` — falta a URL exata para corrigir.

## Auditoria de autenticação — fase 2 (2026-10-06)

**Contrato.** Cópia fiel do OpenAPI do fornecedor em `docs/vendor/selsyn/openapi.json` (arquivo baixado pelo cliente em 06/10/2026, 218 operações; OpenAPI 3.0.1, info.version 3.0.0, servers `/keek/rest/`). Não é usado em runtime; `check-selsyn` falha se o catálogo divergir dele. A página oficial continuou inacessível deste ambiente (timeout), então a origem é o download do cliente, não captura direta.

**securitySchemes.** `api-key-cliente`: x-api-key na query (chave do cadastro de Cliente) · `api-key-monitor`: x-api-key na query (monitor conveniado) · `api-key-grupo`: x-api-key na query (grupo de rastreáveis) · `x-api-key`: header (cadastro de Operador) · `token`: header `x-r2f-auth` (via GET /login).

| Operação | Path | Security aceito | LOCAKAR envia |
|---|---|---|---|
| aovivo | GET /keek/rest/posicao/v2/aovivo | api-key-cliente | x-api-key na query |
| integracaoAoVivo | GET /keek/rest/v1/integracao/posicao | cliente, grupo ou monitor | x-api-key na query |
| intergacaoListTipoAlerta | GET /keek/rest/v1/integracao/alerta/tipo | cliente, grupo ou monitor | x-api-key na query |
| gdrAovivo | GET /keek/rest/v1/integracao/gdr/posicao/aovivo | cliente, grupo ou monitor | x-api-key na query |

**Diferenças:** nenhuma em host, base path, path, método, local/nome da credencial ou parâmetros (todos opcionais). `SELSYN_ORGANIZATION_ID` é só configuração interna LOCAKAR (isolamento) e nunca é enviado à Selsyn.

**Conclusão.** Request confere com o contrato. As quatro famílias recusam com 403, inclusive `aovivo`, que só aceita chave de Cliente. Isso é compatível com chave de outro tipo (Operador, que vai no header), chave inativa ou sem módulo liberado — o contrato documenta só respostas `default`, então a distinção depende do corpo do 403 (agora capturado e sanitizado) e da Selsyn. Autenticação **não** foi alterada por tentativa.

## Causa raiz do 403 (2026-10-06, confirmada)

Teste controlado via túnel SOCKS (IP 150.230.226.76), somente leitura, mesma chave:

| Operação | Chave na query (contrato) | Chave no header x-api-key |
|---|---|---|
| aovivo | 403 | 200 |
| integracaoAoVivo | 403 | 200 |
| intergacaoListTipoAlerta | 403 | 200 |
| gdrAovivo | 403 | 200 |

Controles: sem chave e chave inválida = 403 com o mesmo corpo `{"message":"Acesso não autorizado."}`. A especificação oficial (`/keek/rest/openapi.json`, referenciada por `documentacao.html`) é idêntica à cópia salva e diz query — divergência do fornecedor, não do código. **Correção:** o transporte envia a chave só no header `x-api-key` (também tira a chave da URL). Testado numa operação de cada família; demais operações seguem o mesmo esquema documental.

## Validação real de recursos — 06/10/2026

Consultas GET pelo túnel SOCKS autorizado, rastreável 916, período de 24 horas; sem gravar chave/telemetria em arquivos:

| Recurso | Operação | Resultado |
|---|---|---|
| Posição e estado | aovivoPorRastreavel / integracaoAoVivoPorPlaca / aovivo | 200; posição, data, velocidade, ignição, bloqueio habilitado |
| Histórico | listHistoricoPosicaoPorRastreavel | 200; content.posicoes, 802 registros na consulta |
| Relatório de posições | relatorioHistoricoPosicao | 200; conteúdo JSON |
| Paradas | relatorioHistoricoParada | 200 |
| Histórico de sensores | relatorioHistoricoSensor | 404; `Registro não encontrado { Sensor }`; snapshot atual contém zero sensores. Cadastro/disponibilidade de sensor requer confirmação do fornecedor. |
| Situação atual | relatorioSituacaoAtual | 200; PDF base64 em content, 55 KB; decoder agora entrega arquivo |
| Alertas | listAlerta | 200; 38 registros no período |
| Relatório de eventos | relatorioEvento | 200 |
| Últimos alertas | integracaoAlerta | 200; lista vazia |
| Tipos de alerta | intergacaoListTipoAlerta | 200; 147 tipos |

Correções: mapa histórico lê `content.posicoes`; filtros usam o rastreável selecionado inclusive no parâmetro `rastreavel`; menus escondem consultas globais sem escopo; frota usa `aovivo.content.items` para sensores/estado; relatório com PDF base64 convertido em download com limite e checagem de segredo. Atualização automática opt-in a cada 30 segundos por padrão, respeita aba visível e desliga após erro. `SELSYN_POSITION_REFRESH_SECONDS` existente continua prevalecendo (se 120, permanece 120); não é streaming nem altera o intervalo do rastreador.

### Bloqueio e desbloqueio — pendentes de homologação

Contrato documenta `gdrLock` PUT `/v1/integracao/gdr/bloqueio/{identificador}/{imei}` e `gdrUnlock` PUT `/v1/integracao/gdr/desbloqueio/{identificador}/{imei}`, resposta `ComandoDto`. **Nenhum PUT executado**. `deviceId` da posição não prova o IMEI exigido: ainda falta confirmação do fornecedor. Rota de comando responde `COMMANDS_DISABLED`, status expõe `commandsEnabled:false`; UI permanece oculta. Não há transporte de comando ativo. Antes de liberar: IMEI vinculado verificado, reautenticação, reserva/idempotência atômicas, auditoria obrigatória, posição <=60s, velocidade0 e igniçãofalse, testes mockados e homologação supervisionada com veículo parado. Não prometer 100% sem essa homologação.

## Bloqueio/desbloqueio — implementação com guardas (06/10/2026)

A implementação está no código, mas **não foi homologada fisicamente**. Nenhum comando foi enviado durante desenvolvimento/testes.

1. Aplicar `20261019000000_selsyn_commands.sql`: coluna `vehicles.selsyn_imei`, proteção contra edição direta, ledger service-role-only `selsyn_commands` e RPC atômica por veículo/request UUID. A migration não preenche IMEI nem envia comandos.
2. Dono/administrador abre o card do veículo, `Cadastrar IMEI`, confere a associação no painel Selsyn, digita IMEI, placa e senha. Para SIH7H03/916 o usuário informou `866557080755830`; não é usado como config global ou inferido de deviceId.
3. Após validar cadastro e proteções, habilitar `SELSYN_COMMANDS_ENABLED=true` no servidor. Por padrão false. Se faltar migration/IMEI, falha fechada.
4. `Bloquear`/`Desbloquear`: mesma origem, papel owner/admin, confirmação de senha em cliente Auth isolado, identidade igual, MFA se já configurado, até 5 confirmações/10min, placa, motivo, UUID estável. Senha nunca armazenada/logada.
5. Reserva SQL trava veículo, valida org/ator, snapshot de vínculo/IMEI, deduplica UUID e impede concorrência/cooldown. Estados reserved/sending/accepted/unknown impedem comandos novos e alteração de vínculo. Falhas incertas não são repetidas nem descartadas por tempo.
6. Para bloquear: posição<=60s, placa/ID certos, lockEnabledtrue, speed0, ignitionfalse e não offline. Não relaxar por conveniência. Desbloquear não exige o predicado de posição, mas não ignora comandos incertos.
7. PUT fixo gdrLock/gdrUnlock com x-api-key header. Nunca gdrActivateOutput ou outro acionamento. Resposta mostra apenas ID/status resumidos; HTTP200 não confirma execução. Sem retry.
8. `Verificar comando`: GET autoritativo de posição. Só confirma comando aceito quando há returnDate do dispositivo e telemetria posterior compatível. Sem returnDate/status conclusivo, permanece pendente e exige suporte Selsyn — não liberar automaticamente comando contrário que possa ultrapassar um comando atrasado.

**Homologação pendente:** autenticação real, INSERT/UPDATE/RPC no Supabase, concorrência em PostgreSQL e ciclo físico acompanhado. PostgreSQL local instalado está incompleto (`dict_snowball` ausente), impedindo executar migration em banco isolado; verificações SQL da suíte são estruturais, não homologação de concorrência. Build local também bloqueado pelo download Google Fonts. Não habilitar produção como “100% garantido”.

## Reconciliação de comandos — correção posterior (06/10/2026)

`Verificar comando` passa a consultar `getLastCommandExecution`, GET `/intervencao/comando/{idRastreavel}/{deviceId}/{LOCK|UNLOCK}`, sem reenviar lock/unlock. Requer `SELSYN_ACCESS_TOKEN` server-only em header `x-r2f-auth`; API Key não serve de fallback. Configuração ausente/expirada é informada sem revelar token. Login automático/refresh não implementados: `/login` documenta x-user-auth sem formato e tokens sem schema; não inventar senha/hash/campo de resposta.

Aplicar a migration complementar `20261020000000_selsyn_command_reconciliation.sql`, que acrescenta `provider_returned_at` mesmo a uma tabela já existente e registra snapshot de dispositivo, última consulta, resultado resumido e erro de correlação. Não apaga comandos pendentes.

Cada consulta procura o pendente diretamente no ledger escopado (não só nas últimas 10 entradas). Compara ID do comando, LOCK/UNLOCK, dispositivo, vínculo, IMEI e horário de envio; respostas de outro comando não alteram o registro. Comando histórico sem deviceId persistido exige vínculo/IMEI explícitos no retorno `dispositivo`; não preenche snapshot por dedução de IMEI=ID. Novos envios guardam o deviceId retornado no recibo.

O OpenAPI não enumera status terminais: `SENT`/returnDate nulo continua pendente. Mesmo retorno existente com status sem semântica comprovada é registrado com `TERMINAL_STATUS_UNVERIFIED`; não marca confirmed nem remove a trava. Timeout de GET preserva o estado do envio original. UI mostra ID Selsyn, status e retorno reais, última consulta, erro e presença do token.

**Pendente de contrato/credencial real:** autenticação autorizada por token, mapeamento de estados finais/resultados e correlação completa do comando2396. Testes são fixtures, sem acesso a conta/segredos. `solicitarPosicao` é PUT físico separado, não ativado por refresh; permanece indisponível até validar token/dispositivo e fluxo idempotente. Não remover stale-position nem reenviar2396 para resolver pendência.

## Inspeção pública do Rastreame — 07/10/2026

Pesquisa pelo túnel de rede autorizado, somente HTML/JavaScript públicos, **sem login, CPF, senha, cookie ou comando físico**. Fontes: `https://rastreame.com.br/`, `/runtime-config.js`, `/assets/index-Dt82KT5n.js` (SHA256 `1bdb6a4096898f1019210028d8ecc49f6c4a738f584f4ecae031ffcbd8b26050`).

- O frontend atual usa `POST /auth/rest/login/v2/keek/{timezone}`, não o `GET /keek/rest/login` do OpenAPI arquivado. A representação literal do authorization é base64 de `login + '&#58;' + senha + '&#58;' + origin`; não tratar esses separadores como ':' por decodificação HTML fora do contrato JavaScript.
- A sessão usa `accessToken`, `refreshToken`, `loginExpireAt`, `accessTokenExpireAt`. Requests autenticados levam `X-r2f-Auth: accessToken` e opcionalmente `X-r2f-Ns` da base selecionada.
- Renovação no frontend usa `POST /auth/rest/login/v2/refresh/?versao=2000`, authorization formado com login/refreshToken/origem. Ainda não implementado em LocaKar: exige credenciais substitutas autorizadas e armazenamento seguro dos tokens rotativos; não usar credenciais expostas no chat.
- Histórico do portal usa GET `/keek/rest/comando/{deviceId}`, acompanhamento usa GET `/keek/rest/intervencao/comando/{idRastreavel}/{deviceId}/{tipo}`. Caminho público observado não prova permissão da conta LocaKar nem resposta de2396.
- O mapa atualiza lock otimisticamente após aceitar PUT. A UI de histórico considera result preenchido ou mais de120s para parar polling; cores reconhecem SUCCESS/OK, ERROR/FAIL e SENT/PENDING. Isso é comportamento de interface, não garantia de entrega ou autorização para limpar ledger de LocaKar por tempo.

Correções pequenas de diagnóstico: exibir HTTP401/403 do fornecedor, distinguir status histórico preservado de consulta atual que falhou, trocar mensagem antiga de confirmação por telemetria. Nenhuma autenticação ou operação física executada. `TOKEN_AUTH_FAILED` permanece causa aberta: token incorreto/expirado, permissão, origem/namespace dependem de resposta autenticada válida; não afirmar qual delas sem evidência.

## Sessão Rastreame renovável — 07/10/2026

Implementação baseada no protocolo do JS público inspecionado, sem login real nesta sessão:

1. Aplicar `20261021000000_selsyn_session.sql`. Ela cria `selsyn_session` service-role-only e RPCs de lease/CAS por locadora. Não envia comandos nem apaga o ledger.
2. Configurar `SELSYN_ENCRYPTION_KEY` (32 bytes base64) na Vercel e fazer redeploy.
3. Em Configurações → Integrações → Selsyn, dono/administrador clica **Conectar / reconectar Rastreame**, informa login e **senha nova** (a exposta no chat deve ser trocada) e confirma a própria senha do LocaKar. Namespace só se a conta exigir base selecionada.
4. Login: `POST https://rastreame.com.br/auth/rest/login/v2/keek/America@Recife`, sem corpo, `authorization` = base64 Latin1 de `login&#58;senha&#58;https://rastreame.com.br` (separador literal). Refresh: `POST /auth/rest/login/v2/refresh/?versao=2000` com o refreshToken no lugar da senha. A senha não é armazenada; só login, access e refresh cifrados.
5. Renovação automática quando o access expira em menos de 60 s. Lease SQL garante um refresh por vez; resposta tardia não sobrescreve sessão mais nova. Timeout/falha após enviar o refresh marca `reauth_required` em vez de repetir o token possivelmente consumido.
6. Consulta de execução usa `X-r2f-Auth` (e `X-r2f-Ns` quando configurado) em `https://rastreame.com.br/keek/rest/`. Se o último comando do tipo não for o registrado, busca o ID exato no histórico `GET /keek/rest/comando/{deviceId}`; nunca assume o último.
7. Datas de expiração aceitas só em ISO com fuso. Outro formato retorna `SESSION_RESPONSE_UNSUPPORTED` sem salvar tokens; ajustar só com a resposta real observada.

**Não resolvido sem homologação:** semântica final de status/result. SUCCESS/OK/cores do portal ficam registrados, mas não liberam a trava sozinhos. Pendência2396 continua até confirmação real; nada é reenviado nem limpo por tempo.

## Inventário técnico
A tabela a seguir é gerada do catálogo oficial. Todos implementados no catálogo/API/formulários; chamadas reais pendentes de ambiente e fornecedor. Ver schemas completos em `src/lib/selsyn-contracts.json`.

| Funcionalidade / operationId | Endpoint | Método / Security | Teste |
|---|---|---|---|
| Consultar um Evento / findAlerta | /v2/alerta/{id} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar a posição de um Evento / findAlertaByPosicaoId | /v2/alerta/posicao/{posicaoId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Pesquisar Alertas / listAlerta | /v2/alerta | GET / api-key-cliente | Fixture/contrato; real pendente |
| Pesquisar Alertas para monitoramento / listAlertaMonitormento | /v2/alerta/monitoramento | GET / api-key-cliente | Fixture/contrato; real pendente |
| Dashboard de avaliação condução / getDashboardAvaliacaoConducao | /dashboard/cliente/avaliacao-conducao/{entidade} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Dashboard de gastos gerais / getDashboardClientGasto | /dashboard/cliente/gasto | GET / api-key-cliente | Fixture/contrato; real pendente |
| Dashboard situação atual / getDashboardCliente | /dashboard/cliente | GET / api-key-cliente | Fixture/contrato; real pendente |
| Dashboard de abastecimento / getDashboardClienteAbastecimento | /dashboard/cliente/abastecimento | GET / api-key-cliente | Fixture/contrato; real pendente |
| Dashboard de manutenção / getDashboardClienteManutencao | /dashboard/cliente/manutencao | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Última Atualização / gdrAovivo | /v1/integracao/gdr/posicao/aovivo | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Última Atualização por Identificador / gdrAovivoPorIdentificador | /v1/integracao/gdr/posicao/aovivo/{identificador} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Exportar Evento Periférico / gdrExportarEventoPerifericoById | /v1/integracao/gdr/evento-periferico/exportar/{fromEventoPerifericoId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Exportar Posições / gdrExportarPosicao | /v1/integracao/gdr/posicao/exportar/{fromPositionId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Rastreável por Identificador / gdrFindRastreavelPorIdentificador | /v1/integracao/gdr/rastreavel/{identificador} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Evento Periférico / gdrGetEventoPerifericoById | /v1/integracao/gdr/evento-periferico/{id} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Alertas / gdrListAlertas | /v1/integracao/gdr/alerta | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Histórico de Posições / gdrListHistoricoPosicaoPorRastreavel | /v1/integracao/gdr/posicao/historico/{identificador} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Alerta por ID / gdrfindAlertaById | /v1/integracao/gdr/alerta/{id} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Ultimos Alertas / integracaoAlerta | /v1/integracao/alerta | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Agrupadores de Alertas / integracaoAlertaAgrupador | /v1/integracao/alerta/agrupador | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Ultima Atualização / integracaoAoVivo | /v1/integracao/posicao | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Ultima Atualização de um Rastreavel / integracaoAoVivoPorPlaca | /v1/integracao/posicao/{identificador} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Alerta por Agrupador / integracapListAlertaAgrupador | /v1/integracao/alerta/tipo/{agrupador} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Consultar Todos os Tipos de Alertas / intergacaoListTipoAlerta | /v1/integracao/alerta/tipo | GET / api-key-cliente | Fixture/contrato; real pendente |
| Ancora do rastreavel / ancoraPorRastreavel | /posicao/v2/ancora/{rastreavelId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Ultima posição / aovivo | /posicao/v2/aovivo | GET / api-key-cliente | Fixture/contrato; real pendente |
| Ultima posição do rastreavel / aovivoPorRastreavel | /posicao/v2/aovivo/{rastreavelId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Ultima posição satelital do rastreavel / aovivoSatelital | /posicao/v2/satelital/aovivo/{rastreavelId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Jornadas do rastreavel / jornadaRastreavel | /posicao/v2/jornada/rastreavel/{rastreavelId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Histórico de posições arquivadas do rastreavel / listHistoricoPosicaoArquivadoPorRastreavel | /posicao/v2/historico/arquivado/{rastreavelId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Histórico de posições do rastreavel / listHistoricoPosicaoPorRastreavel | /posicao/v2/historico/{rastreavelId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Histórico de posições satelitais do rastreavel / listHistoricoSatelitalPorRastreavel | /posicao/v2/satelital/historico/{rastreavelId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de exportação de posições / exportarPositionPorRastreavel | /relatorio/exportar-posicao/{idRastreavel} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de abastecimento / relatorioAbastecimento | /relatorio/abastecimento | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de avaliação de condução / relatorioAvaliacaoConducao | /relatorio/avaliacao-conducao/{entidade} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de custo operacional / relatorioCustoOperacional | /relatorio/custo-operacional | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de eventos / relatorioEvento | /relatorio/evento | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de fonte de energia / relatorioFonteEnergia | /relatorio/fonte-energia | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de gastos gerais / relatorioGasto | /relatorio/gasto | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de histórico de eventos do periférico / relatorioHistoricoEventoPeriferico | /relatorio/evento-periferico/historico/{idRastreavel} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de histórico de paradas / relatorioHistoricoParada | /relatorio/historico-parada/{idRastreavel} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de histórico de posições / relatorioHistoricoPosicao | /relatorio/historico-posicao/{idRastreavel} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de histórico de sensor / relatorioHistoricoSensor | /relatorio/sensor/historico/{idRastreavel} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de jornadas por cerca / relatorioJornadaCerca | /relatorio/jornada/cerca | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de jornadas do motorista / relatorioJornadaMotorista | /relatorio/jornada/motorista/{motoristaId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de jornadas do rastreavel / relatorioJornadaRastreavel | /relatorio/jornada/rastreavel/{idRastreavel} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de manutenção / relatorioManutencao | /relatorio/manutencao | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de monitoramento / relatorioMonitoramento | /relatorio/monitoramento | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de histórico detalhado de sensor / relatorioSensorDetalhado | /relatorio/sensor/detalhado/{idRastreavel}/{sensorId} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório da situação atual / relatorioSituacaoAtual | /relatorio/situacao-atual/{idRastreavel} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de totalizadores do rastreavel / relatorioTotalizador | /relatorio/totalizador | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de totalizador diário do rastreavel / relatorioTotalizadorDiario | /relatorio/totalizador/diario/{idRastreavel} | GET / api-key-cliente | Fixture/contrato; real pendente |
| Relatório de velocidades do rastreavel / relatorioVelocidade | /relatorio/velocidade/{idRastreavel}/{limiteVelocidade} | GET / api-key-cliente | Fixture/contrato; real pendente |

### Parâmetros por consulta

#### Consultar um Evento (findAlerta)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| id | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/EventoDto"}

#### Consultar a posição de um Evento (findAlertaByPosicaoId)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| posicaoId | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/EventoDto"}

#### Pesquisar Alertas (listAlerta)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| status | query | Não | string | — | NONE, NEW, OPENED, CLOSED, ARCHIVED |
| tipo | query | Não | string | — | NONE, IGNITION, SECURITY_ATTACK, PANIC, SPEED_LIMIT, LOCK_UNLOCK, GEO_FENCE, SENSOR_LIMITS, ENERGY_SOURCE, COLLISION_ALARM, DEVICE_BATTERY, GPS, OFFLINE_TIMEOUT, SLEEP_MODE, INPUT1_OPEN, INPUT1_GROUND, INPUT2_OPEN, INPUT2_GROUND, INPUT3_OPEN, INPUT3_GROUND, EXTERNAL_INPUT, OUTPUT, BEHAVIOR, STOPPED_OVERTIME, CALIBRATION, I_BUTTON, DRIVER_AUTHORIZATION, PARKING_LOCK, DRIVING_SCHEDULE, MAGNETIC_CONNECTION, DOCUMENTATION, MECHANICAL_ISSUE, DEVICE_ISSUE, GPRS, OBD, CUSTOM, GENERIC, REDE_INPUTS, REDE_OUTPUTS, REPORTADO, CAMERA, INPUT4_OPEN, INPUT4_GROUND, IMPLEMENT_CONNECTION, SENSOR_LIGHT, SENSOR_BETONEIRA, INPUT5_OPEN, INPUT5_GROUND, INPUT6_OPEN, INPUT6_GROUND |
| cliente | query | Não | number | — | — |
| deparatamento | query | Não | number | — | — |
| motorista | query | Não | number | — | — |
| rastreavel | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| monitoramento | query | Não | boolean | — | — |
| size | query | Não | number | 100 | — |
| page | query | Não | number | 0 | — |

Response: {"type":"array","items":{"$ref":"#/components/schemas/EventoResultDto"}}

#### Pesquisar Alertas para monitoramento (listAlertaMonitormento)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| status | query | Não | string | — | NONE, NEW, OPENED, CLOSED, ARCHIVED |
| tipo | query | Não | string | — | NONE, IGNITION, SECURITY_ATTACK, PANIC, SPEED_LIMIT, LOCK_UNLOCK, GEO_FENCE, SENSOR_LIMITS, ENERGY_SOURCE, COLLISION_ALARM, DEVICE_BATTERY, GPS, OFFLINE_TIMEOUT, SLEEP_MODE, INPUT1_OPEN, INPUT1_GROUND, INPUT2_OPEN, INPUT2_GROUND, INPUT3_OPEN, INPUT3_GROUND, EXTERNAL_INPUT, OUTPUT, BEHAVIOR, STOPPED_OVERTIME, CALIBRATION, I_BUTTON, DRIVER_AUTHORIZATION, PARKING_LOCK, DRIVING_SCHEDULE, MAGNETIC_CONNECTION, DOCUMENTATION, MECHANICAL_ISSUE, DEVICE_ISSUE, GPRS, OBD, CUSTOM, GENERIC, REDE_INPUTS, REDE_OUTPUTS, REPORTADO, CAMERA, INPUT4_OPEN, INPUT4_GROUND, IMPLEMENT_CONNECTION, SENSOR_LIGHT, SENSOR_BETONEIRA, INPUT5_OPEN, INPUT5_GROUND, INPUT6_OPEN, INPUT6_GROUND |
| cliente | query | Não | number | — | — |
| deparatamento | query | Não | number | — | — |
| motorista | query | Não | number | — | — |
| rastreavel | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| monitoramento | query | Não | boolean | — | — |
| size | query | Não | number | 100 | — |
| page | query | Não | number | 0 | — |

Response: {"type":"array","items":{"$ref":"#/components/schemas/EventoResultDto"}}

#### Dashboard de avaliação condução (getDashboardAvaliacaoConducao)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| entidade | path | Sim | string | — | motorista|rastreavel |

Response: {"$ref":"#/components/schemas/DashboardAvaliacaoConducaoResultDto"}

#### Dashboard de gastos gerais (getDashboardClientGasto)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| grupo | query | Não | number | — | — |
| rastreavel | query | Não | number | — | — |
| motorista | query | Não | number | — | — |
| fornecedor | query | Não | number | — | — |
| tipo | query | Não | string | — | OUTROS, MULTA, PEDAGIO, DOCUMENTACAO, ALIMENTACAO, HOSPEDAGEM, SALARIO, DESCARGA_MERCADORIA |

Response: {"$ref":"#/components/schemas/DashboardGastoResultDto"}

#### Dashboard situação atual (getDashboardCliente)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |

Response: {"$ref":"#/components/schemas/DashboardClienteResultDto"}

#### Dashboard de abastecimento (getDashboardClienteAbastecimento)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| rastreavel | query | Não | number | — | — |
| motorista | query | Não | number | — | — |
| fornecedor | query | Não | number | — | — |
| arla | query | Não | string | false | — |
| categoria | query | Não | string | VEICULO | VEICULO, NAUTICO, AERONAUTICO, PESSOA, ANIMAL, MAQUINA, OBJETO |

Response: {"$ref":"#/components/schemas/DashboardAbastecimentoResultDto"}

#### Dashboard de manutenção (getDashboardClienteManutencao)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| grupo | query | Não | number | — | — |
| rastreavel | query | Não | number | — | — |
| motorista | query | Não | number | — | — |
| fornecedor | query | Não | number | — | — |
| tipo | query | Não | string | — | OUTROS, PROGRAMADA, EMERGENCIAL, ELETRICA, PNEU, FUNILARIA, MECANICA, OLEO, BORRACHARIA, TAPECARIA, REFRIGERACAO, SERVICO, SINISTRO, REBOQUE, DOCUMENTACAO, SEGURO, PECAS, LIMPEZA, BATERIA, TACOGRAFO, MUNCK, GNV, VISTORIA |

Response: {"$ref":"#/components/schemas/DashboardManutencaoResultDto"}

#### Consultar Última Atualização (gdrAovivo)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| departamento | query | Não | number | — | — |
| grupo | query | Não | number | — | — |
| status | query | Não | string | — | MOVING_ON, MOVING_OFF, STOPPED_ON, STOPPED_OFF, MOVING_NO_IGNITION, STOPPED_NO_IGNITION, NO_IGNITION_INFO, NO_SPEED_INFO, OFF_LINE |
| rastreavel | query | Não | number | — | — |

Response: {"type":"array","items":{"$ref":"#/components/schemas/AoVivoDto"}}

#### Consultar Última Atualização por Identificador (gdrAovivoPorIdentificador)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| identificador | path | Sim | string | — | — |

Response: {"$ref":"#/components/schemas/AoVivoDto"}

#### Exportar Evento Periférico (gdrExportarEventoPerifericoById)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Não | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Não | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| size | query | Não | number | 10000 | — |
| page | query | Não | number | 0 | — |
| fromEventoPerifericoId | path | Sim | integer / int64 | — | — |

Response: {"type":"array","items":{"$ref":"#/components/schemas/EventoPerifericoExportDto"}}

#### Exportar Posições (gdrExportarPosicao)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Não | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Não | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| size | query | Não | number | 10000 | — |
| page | query | Não | number | 0 | — |
| fromPositionId | path | Sim | integer / int64 | — | — |

Response: {"type":"array","items":{"$ref":"#/components/schemas/PosicaoExportDto"}}

#### Consultar Rastreável por Identificador (gdrFindRastreavelPorIdentificador)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| identificador | path | Sim | string | — | — |

Response: {"$ref":"#/components/schemas/RastreavelIntegracaoDto"}

#### Consultar Evento Periférico (gdrGetEventoPerifericoById)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| id | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/EventoPerifericoDto"}

#### Consultar Alertas (gdrListAlertas)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| status | query | Não | string | — | NONE, NEW, OPENED, CLOSED, ARCHIVED |
| tipo | query | Não | string | — | NONE, IGNITION, SECURITY_ATTACK, PANIC, SPEED_LIMIT, LOCK_UNLOCK, GEO_FENCE, SENSOR_LIMITS, ENERGY_SOURCE, COLLISION_ALARM, DEVICE_BATTERY, GPS, OFFLINE_TIMEOUT, SLEEP_MODE, INPUT1_OPEN, INPUT1_GROUND, INPUT2_OPEN, INPUT2_GROUND, INPUT3_OPEN, INPUT3_GROUND, EXTERNAL_INPUT, OUTPUT, BEHAVIOR, STOPPED_OVERTIME, CALIBRATION, I_BUTTON, DRIVER_AUTHORIZATION, PARKING_LOCK, DRIVING_SCHEDULE, MAGNETIC_CONNECTION, DOCUMENTATION, MECHANICAL_ISSUE, DEVICE_ISSUE, GPRS, OBD, CUSTOM, GENERIC, REDE_INPUTS, REDE_OUTPUTS, REPORTADO, CAMERA, INPUT4_OPEN, INPUT4_GROUND, IMPLEMENT_CONNECTION, SENSOR_LIGHT, SENSOR_BETONEIRA, INPUT5_OPEN, INPUT5_GROUND, INPUT6_OPEN, INPUT6_GROUND |
| rastreavel | query | Não | string | — | — |
| monitoramento | query | Não | boolean | — | — |
| size | query | Não | number | 100 | — |
| page | query | Não | number | 0 | — |

Response: {"type":"array","items":{"$ref":"#/components/schemas/EventoResultDto"}}

#### Consultar Histórico de Posições (gdrListHistoricoPosicaoPorRastreavel)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| type | query | Não | string | — | STT, ALT, EMG, EVT, PID, UEX, UBL |
| dispositivo | query | Não | number | — | — |
| identificador | path | Sim | string | — | — |

Response: {"$ref":"#/components/schemas/HistoricoResultDto"}

#### Consultar Alerta por ID (gdrfindAlertaById)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| id | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/EventoDto"}

#### Consultar Ultimos Alertas (integracaoAlerta)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| ultimosMinutos | query | Não | number | — | — |

Response: {"type":"array","items":{"$ref":"#/components/schemas/AlertaIntegracaoDto"}}

#### Consultar Agrupadores de Alertas (integracaoAlertaAgrupador)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|

Response: {"type":"array","items":{"$ref":"#/components/schemas/SelectableDto"}}

#### Consultar Ultima Atualização (integracaoAoVivo)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| identificador | query | Não | string | — | — |

Response: {"type":"array","items":{"$ref":"#/components/schemas/PosicaoIntegracaoDto"}}

#### Consultar Ultima Atualização de um Rastreavel (integracaoAoVivoPorPlaca)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| identificador | path | Sim | string | — | — |

Response: {"$ref":"#/components/schemas/PosicaoIntegracaoDto"}

#### Consultar Alerta por Agrupador (integracapListAlertaAgrupador)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| agrupador | path | Sim | string | — | NONE, IGNITION, SECURITY_ATTACK, PANIC, SPEED_LIMIT, LOCK_UNLOCK, GEO_FENCE, SENSOR_LIMITS, ENERGY_SOURCE, COLLISION_ALARM, DEVICE_BATTERY, GPS, OFFLINE_TIMEOUT, SLEEP_MODE, INPUT1_OPEN, INPUT1_GROUND, INPUT2_OPEN, INPUT2_GROUND, INPUT3_OPEN, INPUT3_GROUND, EXTERNAL_INPUT, OUTPUT, BEHAVIOR, STOPPED_OVERTIME, CALIBRATION, I_BUTTON, DRIVER_AUTHORIZATION, PARKING_LOCK, DRIVING_SCHEDULE, MAGNETIC_CONNECTION, DOCUMENTATION, MECHANICAL_ISSUE, DEVICE_ISSUE, GPRS, OBD, CUSTOM, GENERIC, REDE_INPUTS, REDE_OUTPUTS, REPORTADO, CAMERA, INPUT4_OPEN, INPUT4_GROUND, IMPLEMENT_CONNECTION, SENSOR_LIGHT, SENSOR_BETONEIRA, INPUT5_OPEN, INPUT5_GROUND, INPUT6_OPEN, INPUT6_GROUND |

Response: {"type":"array","items":{"$ref":"#/components/schemas/SelectableDto"}}

#### Consultar Todos os Tipos de Alertas (intergacaoListTipoAlerta)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|

Response: {"type":"array","items":{"$ref":"#/components/schemas/TipoAlertaResultDto"}}

#### Ancora do rastreavel (ancoraPorRastreavel)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| rastreavelId | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/AncoraDto"}

#### Ultima posição (aovivo)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| cliente | query | Não | number | — | — |
| rastreavel | query | Não | string | — | — |
| grupo | query | Não | number | — | — |
| status | query | Não | string | — | MOVING_ON, MOVING_OFF, STOPPED_ON, STOPPED_OFF, MOVING_NO_IGNITION, STOPPED_NO_IGNITION, NO_IGNITION_INFO, NO_SPEED_INFO, OFF_LINE |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Ultima posição do rastreavel (aovivoPorRastreavel)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| rastreavelId | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/AoVivoDto"}

#### Ultima posição satelital do rastreavel (aovivoSatelital)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| rastreavelId | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/AoVivoDto"}

#### Jornadas do rastreavel (jornadaRastreavel)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| rastreavelId | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Histórico de posições arquivadas do rastreavel (listHistoricoPosicaoArquivadoPorRastreavel)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| type | query | Não | string | — | STT, ALT, EMG, EVT, PID, UEX, UBL |
| dispositivo | query | Não | number | — | — |
| endereco | query | Não | boolean | false | — |
| cliente | query | Não | number | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| rastreavelId | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Histórico de posições do rastreavel (listHistoricoPosicaoPorRastreavel)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| type | query | Não | string | — | STT, ALT, EMG, EVT, PID, UEX, UBL |
| dispositivo | query | Não | number | — | — |
| endereco | query | Não | boolean | false | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| rastreavelId | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Histórico de posições satelitais do rastreavel (listHistoricoSatelitalPorRastreavel)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dispositivo | query | Não | number | — | — |
| endereco | query | Não | boolean | false | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| rastreavelId | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de exportação de posições (exportarPositionPorRastreavel)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dispositivo | query | Não | number | — | — |
| endereco | query | Não | boolean | false | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| idRastreavel | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de abastecimento (relatorioAbastecimento)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| rastreavel | query | Não | string | — | — |
| fornecedor | query | Não | number | — | — |
| categoria | query | Não | string | VEICULO | VEICULO, NAUTICO, AERONAUTICO, PESSOA, ANIMAL, MAQUINA, OBJETO |
| arla | query | Não | string | false | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de avaliação de condução (relatorioAvaliacaoConducao)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| entidade | path | Sim | string | — | motorista|rastreavel |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de custo operacional (relatorioCustoOperacional)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de eventos (relatorioEvento)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| status | query | Não | string | — | NONE, NEW, OPENED, CLOSED, ARCHIVED |
| tipo | query | Não | string | — | NONE, IGNITION, SECURITY_ATTACK, PANIC, SPEED_LIMIT, LOCK_UNLOCK, GEO_FENCE, SENSOR_LIMITS, ENERGY_SOURCE, COLLISION_ALARM, DEVICE_BATTERY, GPS, OFFLINE_TIMEOUT, SLEEP_MODE, INPUT1_OPEN, INPUT1_GROUND, INPUT2_OPEN, INPUT2_GROUND, INPUT3_OPEN, INPUT3_GROUND, EXTERNAL_INPUT, OUTPUT, BEHAVIOR, STOPPED_OVERTIME, CALIBRATION, I_BUTTON, DRIVER_AUTHORIZATION, PARKING_LOCK, DRIVING_SCHEDULE, MAGNETIC_CONNECTION, DOCUMENTATION, MECHANICAL_ISSUE, DEVICE_ISSUE, GPRS, OBD, CUSTOM, GENERIC, REDE_INPUTS, REDE_OUTPUTS, REPORTADO, CAMERA, INPUT4_OPEN, INPUT4_GROUND, IMPLEMENT_CONNECTION, SENSOR_LIGHT, SENSOR_BETONEIRA, INPUT5_OPEN, INPUT5_GROUND, INPUT6_OPEN, INPUT6_GROUND |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| rastreavel | query | Não | string | — | — |
| motorista | query | Não | number | — | — |
| statusCerca | query | Não | string | TODOS | DENTRO, FORA, TODOS |
| cerca | query | Não | number | — | — |
| eventoPersonalizado | query | Não | number | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de fonte de energia (relatorioFonteEnergia)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| power-ge | query | Não | number | — | — |
| power-le | query | Não | number | — | — |
| battery-ge | query | Não | number | — | — |
| battery-le | query | Não | number | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de gastos gerais (relatorioGasto)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| rastreavel | query | Não | string | — | — |
| fornecedor | query | Não | number | — | — |
| motorista | query | Não | number | — | — |
| tipo | query | Não | string | — | OUTROS, MULTA, PEDAGIO, DOCUMENTACAO, ALIMENTACAO, HOSPEDAGEM, SALARIO, DESCARGA_MERCADORIA |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de histórico de eventos do periférico (relatorioHistoricoEventoPeriferico)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dispositivo | query | Não | number | — | — |
| atuadorId | query | Não | number | — | — |
| type | query | Não | string | — | STT, ALT, EMG, EVT, PID, UEX, UBL |
| endereco | query | Não | boolean | false | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| idRastreavel | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de histórico de paradas (relatorioHistoricoParada)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| tempo | query | Não | number | 0 | — |
| tipoParada | query | Não | string | TODOS | TODOS, LIGADO, DESLIGADO |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| idRastreavel | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de histórico de posições (relatorioHistoricoPosicao)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dispositivo | query | Não | number | — | — |
| type | query | Não | string | — | STT, ALT, EMG, EVT, PID, UEX, UBL |
| endereco | query | Não | boolean | false | — |
| sumario | query | Não | boolean | false | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| idRastreavel | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de histórico de sensor (relatorioHistoricoSensor)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| idRastreavel | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de jornadas por cerca (relatorioJornadaCerca)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| rastreavel | query | Não | string | — | — |
| motorista | query | Não | number | — | — |
| cerca | query | Não | number | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de jornadas do motorista (relatorioJornadaMotorista)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| turnoInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| turnoFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| turnoDoisInicial | query | Não | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| turnoDoisFinal | query | Não | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| motoristaId | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de jornadas do rastreavel (relatorioJornadaRastreavel)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| turnoInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| turnoFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| turnoDoisInicial | query | Não | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| turnoDoisFinal | query | Não | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| idRastreavel | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de manutenção (relatorioManutencao)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| rastreavel | query | Não | string | — | — |
| fornecedor | query | Não | number | — | — |
| tipo | query | Não | string | — | OUTROS, PROGRAMADA, EMERGENCIAL, ELETRICA, PNEU, FUNILARIA, MECANICA, OLEO, BORRACHARIA, TAPECARIA, REFRIGERACAO, SERVICO, SINISTRO, REBOQUE, DOCUMENTACAO, SEGURO, PECAS, LIMPEZA, BATERIA, TACOGRAFO, MUNCK, GNV, VISTORIA |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de monitoramento (relatorioMonitoramento)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| status | query | Não | string | — | NONE, NEW, OPENED, CLOSED, ARCHIVED |
| tipo | query | Não | string | — | NONE, IGNITION, SECURITY_ATTACK, PANIC, SPEED_LIMIT, LOCK_UNLOCK, GEO_FENCE, SENSOR_LIMITS, ENERGY_SOURCE, COLLISION_ALARM, DEVICE_BATTERY, GPS, OFFLINE_TIMEOUT, SLEEP_MODE, INPUT1_OPEN, INPUT1_GROUND, INPUT2_OPEN, INPUT2_GROUND, INPUT3_OPEN, INPUT3_GROUND, EXTERNAL_INPUT, OUTPUT, BEHAVIOR, STOPPED_OVERTIME, CALIBRATION, I_BUTTON, DRIVER_AUTHORIZATION, PARKING_LOCK, DRIVING_SCHEDULE, MAGNETIC_CONNECTION, DOCUMENTATION, MECHANICAL_ISSUE, DEVICE_ISSUE, GPRS, OBD, CUSTOM, GENERIC, REDE_INPUTS, REDE_OUTPUTS, REPORTADO, CAMERA, INPUT4_OPEN, INPUT4_GROUND, IMPLEMENT_CONNECTION, SENSOR_LIGHT, SENSOR_BETONEIRA, INPUT5_OPEN, INPUT5_GROUND, INPUT6_OPEN, INPUT6_GROUND |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| rastreavel | query | Não | string | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de histórico detalhado de sensor (relatorioSensorDetalhado)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| sensorId | query | Sim | number | — | — |
| statusSensor | query | Não | string | TODOS | EXCEDIDO, TODOS |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| idRastreavel | path | Sim | integer / int64 | — | — |
| sensorId | path | Sim | integer / int32 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório da situação atual (relatorioSituacaoAtual)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| idRastreavel | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de totalizadores do rastreavel (relatorioTotalizador)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| cliente | query | Não | number | — | — |
| departamento | query | Não | number | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de totalizador diário do rastreavel (relatorioTotalizadorDiario)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| idRastreavel | path | Sim | integer / int64 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}

#### Relatório de velocidades do rastreavel (relatorioVelocidade)

| Campo | Local | Obrigatório | Tipo/formato | Default | Enum/pattern |
|---|---|---|---|---|---|
| dataInicial | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dataFinal | query | Sim | string / yyyy-MM-dd'T'HH:mm:ss.SSS'Z' | — | — |
| dispositivo | query | Não | number | — | — |
| format | query | Não | string | JSON | JSON, PDF_PORTRAIT, PDF_LANDSCAPE, XLSX, HTML |
| idRastreavel | path | Sim | integer / int64 | — | — |
| limiteVelocidade | path | Sim | integer / int32 | — | — |

Response: {"$ref":"#/components/schemas/ReportResultDto"}
