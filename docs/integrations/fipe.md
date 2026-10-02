# FIPE API / Parallelum

## Auditoria inicial
Cadastro único em `src/app/admin/vehicles/page.tsx`: mantém os 14 dados operacionais e o importador CRLV. `vehicles` já possui brand/model/year/year_model/fuel/purchase_value. `year` é fabricação; `year_model` é ano modelo. Compra não é FIPE.
A lista COMMON_BRANDS foi removida. Modelos Mobi/Kwid eram exemplos, não uma restrição do cadastro; `src/data/fleet.ts` e `data/mock` continuam como conteúdo comercial/demo, sem alimentar consultas FIPE.
Reutiliza requireStaff, serviceDb, audit, repositories, componentes existentes, Recharts e cron alerts. Criptografia AES-256-GCM extraída do Asaas para `server/secret.ts`, preservando formato e variável de ambiente do Asaas.

## Fontes oficiais verificadas em 02/10/2026
- https://fipe.api.br/docs/api
- https://fipe.api.br/docs/comece-aqui
- https://fipe.api.br/docs/consultando-a-api

A homepage cita Bearer, mas a referência técnica v2 e o guia exigem **X-Subscription-Token** opcional. O código segue esses contratos técnicos, não envia dois mecanismos de autenticação.
Base fixa: https://fipe.parallelum.com.br/api/v2. Tipos documentados cars/motorcycles/trucks (1/2/3). Não há endpoint de tipos ou placa.

| Método | Path | Finalidade |
|---|---|---|
| GET | /references | Referência vigente e códigos mensais |
| GET | /{vehicleType}/brands | Marcas |
| GET | /{vehicleType}/brands/{brandId}/models | Versões/modelos da marca |
| GET | /{vehicleType}/brands/{brandId}/models/{modelId}/years | Ano modelo/combustível |
| GET | /{vehicleType}/brands/{brandId}/models/{modelId}/years/{yearId} | Preço e detalhe |
| GET | /{vehicleType}/brands/{brandId}/years | Anos da marca |
| GET | /{vehicleType}/brands/{brandId}/years/{yearId}/models | Versões no ano escolhido |
| GET | /{vehicleType}/{fipeCode}/years | Anos por código |
| GET | /{vehicleType}/{fipeCode}/years/{yearId} | Atualização por código |
| GET | /{vehicleType}/{fipeCode}/years/{yearId}/history | Histórico oficial |

Query `reference` opcional é código de /references. Não utiliza o default 278 dos exemplos. `yearId` inclui combustível; 32000 significa zero KM e nunca vira ano civil no cadastro.

## Configuração e autenticação
Configurações → Integrações → Tabela FIPE. Pode usar modo público (500 consultas/dia) ou token (gratuito 1.000/dia; Premium conforme plano). Token é enviado por HTTPS ao backend e cifrado no banco; chave mestra `FIPE_CONFIG_ENCRYPTION_KEY` (32 bytes base64/hex) fica só na Vercel. Nenhuma NEXT_PUBLIC. Testar conexão valida /references; só depois pode ativar. Token inválido não provoca fallback anônimo silencioso.
Segredo não é retornado pelo GET: apenas presença e últimos 4 caracteres. Rotas administrativas requireStaff, body 16KB, resposta externa 2MB, timeout 15s, sem redirects/retries automáticos. Erros nunca propagam corpo/header/token do fornecedor.

## Cadastro
Tipo → marca → versão → ano/combustível → detalhe → Usar estes dados.
Também pode selecionar ano antes da versão (endpoints oficiais). Listas pesquisáveis com botões/inputs nativos, teclado e scroll; não consulta ao digitar.
Seleção não é automática nem ambígua. Preenche marca/tipo/fuel e ano modelo; conserva modelo comercial existente, fabricação, Renavam, chassi, placa, hodômetro, cor e compra. Modelo vazio recebe sugestão oficial editável. Ano 32000 fica só no vínculo como zero KM.
Cadastro salva normalmente; vínculo é gravado depois com validação backend. Se a rede falhar, cadastro permanece manual e a UI informa que FIPE não foi vinculada.

## Placa
Não existe endpoint de placa documentado. `VehicleLookupProvider` é um contrato TypeScript para fornecedor futuro autorizado, sem implementação externa. O botão Consultar veículo explica que consulta por placa não está configurada e oferece FIPE/manual. Nenhuma informação de DETRAN é inferida.

## Persistência
Migration `20261010000000_fipe.sql`:
- `vehicles`: fipe (vínculo JSON), fipe_price numeric(12,2), fipe_reference_month YYYY-MM, fipe_checked_at.
- `vehicle_fipe_history`: FK vehicle_id, code/yearId/price/reference/provider; UNIQUE(vehicle_id,fipe_code,year_id,reference_month). Ano/combustível incluído para não misturar séries do mesmo código.
- `fipe_config`: enabled, auto_update, token cifrado, geração de cache, verificação/erro/cooldown/lease cron. Só service_role.
- `fipe_cache`: resultado validado, TTL e lease. Só service_role.
- RPC save_vehicle_fipe: snapshot/histórico juntos em transação; identidade atual verificada com lock. reserve_fipe_query: lease/dedupe e limite interno.
- Trigger impede client authenticated de forjar campos FIPE e invalida vínculo ao alterar identidade (marca/modelo/fabricação/ano modelo/tipo/fuel). História e compra preservadas.
- História: equipe pode ler via RLS is_staff; só servidor grava. Views tenant continuam sem dados FIPE.

## Histórico, gráfico e patrimônio
Leituras locais reais por referência; mesmo mês/ano/código não duplica. Importação oficial sob demanda adiciona só os meses retornados. Gráfico e variação filtram a série corrente por código+ano/combustível; não inventam pontos. Desvincular preserva a tabela histórica. Comparação FIPE × compra não é chamada de lucro.
Lista, modal de veículo, visão 360, indicador dashboard e relatório de frota usam preço/ref armazenados. Valor FIPE soma não vendidos com preço/referência; cobertura indica ausentes. Relatório mantém valor de compra como total existente.

## Cache e quota
Referências 6h, catálogo/detalhes 24h, chave inclui geração de configuração (trocar token invalida cache sem expor token). Cache persistente e lease SQL evitam repetir consultas em múltiplas instâncias. Limite interno conservador 45 chaves consultadas/minuto e cooldown 1h após 429: diferente dos limites do plano. Não há scraping/dump da base.
Cron alerts existente: após notificações, usa apenas tempo restante de um deadline de 50s; lote até 3 vínculos em referência antiga, sequencial, lease global. Cada consulta limitada ao orçamento, pausa em falha/429. Preço já consultado na referência não é consultado novamente no cron. Depende de CRON_SECRET e cron existente habilitado.

## Arquivos
Criados: lib/fipe.ts, lib/vehicle-lookup.ts, lib/server/secret.ts, lib/server/fipe.ts; api/fipe/{config,query,vehicles}; components/admin/{fipe-settings,fipe-picker,vehicle-fipe-panel}; components/ui/search-choice; migration; scripts/check-fipe.ts/.cjs; este documento.
Alterados: vehicles/settings/dashboard/reports Admin, Vehicle360Dialog, types/index.ts, cron alerts, Asaas crypto wrappers e .env.example. Nenhuma alteração FIPE no app ou processamento financeiro.

## Testes
- `node scripts/check-fipe.cjs`: builders fechados, preços/referências, zero KM, DTO/histórico, variação/cobertura, HTTP/auth/timeout, segredo ausente, limites e guards staff.
- PostgreSQL isolado (PGlite): migration duas vezes, mesma referência sem duplicação, nova referência, identidade divergente, token/cache inacessíveis, preço forjado bloqueado, alteração Mobi/Kwid invalida vínculo preservando compra/história, lease/cooldown.
- UI real com respostas simuladas: 66 casos, 11 larguras Dark/Light, seleção explícita, config/painel; zero overflow/erros JS.
- TypeScript web/app, lint (zero erros; 2 avisos preexistentes em scripts/check.ts), suites pagamentos/Asaas/Selsyn e build passaram.
- Não houve teste autenticado de criação/reabertura de veículo no Supabase real nem cron real.

### Chamadas públicas realmente realizadas (5, sem token)
/references 200 (338/outubro de 2026);
/cars/brands/25/models/7693/years/2020-5 200;
/cars/014090-2/years/2020-5 200 (118.358,00);
/motorcycles/brands 200;
/cars/014090-2/years/2020-5/history 200 (outubro/setembro/agosto 2026).
Isso valida fonte/DTO externo, não todo o fluxo LOCAKAR.

## Pendências externas
1. Aplicar migrations 20261009 (central pagamentos) e 20261010 (FIPE) no Supabase, na ordem.
2. Para token: gerar FIPE_CONFIG_ENCRYPTION_KEY localmente e configurar variável somente servidor na Vercel, redeploy; não reenviar no chat.
3. Configurações → FIPE: salvar token opcional ou modo público, Testar conexão, Ativar. Atualização automática opcional.
4. Homologar um cadastro e reabertura, vínculo/atualização/histórico e permissões na instância real antes de afirmar ponta a ponta.
5. Fornecedor de placa ainda não contratado/configurado. Não há chamada de placa.
