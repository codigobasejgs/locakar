# Motor Inteligente de Contratos Dinâmicos

## 1. Auditoria
- **Sistema encontrado:** antes das alterações, a tabela `contracts` armazenava o texto congelado em `content` com `content_hash` SHA-256 e `token` de 48 caracteres.
- **Assinatura existente:** o locatário assina em `/assinar/[token]` chamando a RPC segura `sign_contract` (validação de CPF, selfie e assinatura em canvas). O contrato assinado é protegido por trigger no banco (`contracts_guard`), que proíbe qualquer alteração ou exclusão após assinado.
- **Modelos no sistema:** a configuração mantinha apenas uma lista de até 5 arquivos anexados no bucket `documentos` (em `templates/`), sem mapeamento ou vínculo ao tipo de locação. A emissão de contratos (`buildContractText` em `src/lib/contract.ts`) sempre gerava um texto genérico padronizado.

## 2. Fluxo Antigo vs. Fluxo Novo

### Fluxo Antigo
1. Locação criada.
2. Clique em "Emitir contrato".
3. Sistema gerava texto estático padrão via código (`DEFAULT_CONTRACT_TERMS`).
4. Documento gerado e enviado para `/assinar/[token]`.

### Fluxo Novo
1. **Upload do Modelo:** Administrador anexa modelo próprio da locadora em PDF ou DOCX em **Configurações → Modelos de Contrato** (limite de 5 modelos).
2. **Análise por IA (uma única vez):** Clique em **"Ler e detectar com IA"**. A IA (Gemini multimodal) analisa a estrutura do documento original uma única vez e retorna sugestões estruturadas com pontuação de confiança.
3. **Revisão Humana Obrigatória:** O administrador visualiza os campos detectados, ajusta o destino com o catálogo estrito de variáveis, marca campos manuais (ex: "Número da Apólice") ou ignora trechos desnecessários.
4. **Modelo Configurado:** Ao clicar em **"Confirmar e aprovar modelo"**, o mapeamento é salvo e o modelo passa ao status `CONFIGURADO` com versionamento automático (`current_version`).
5. **Geração Determinística (SEM IA):** Em novas locações, o sistema carrega o modelo aprovado correspondente ao tipo de locação (`Semanal`, `Mensal`, etc.). O `ContractDataResolver` cruza os dados reais (cliente, veículo, locação, empresa). Se faltar algum campo obrigatório (ex: CPF ou endereço), o sistema bloqueia e avisa.
6. **Assinatura Digital Imutável:** O contrato é gerado, recebe hash SHA-256 e segue exatamente pelo fluxo de assinatura eletrônica existente em `/assinar/[token]`.

## 3. Provider de IA
- **Provedor:** Google Gemini via `Interactions API` (`POST https://generativelanguage.googleapis.com/v1beta/interactions`).
- **Modelo:** `gemini-3.8-flash`.
- **Motivo técnico:** Suporte nativo e multimodal a documentos PDF (até 1.000 páginas), compreensão de diagramas e tabelas, com garantia de saída estruturada através de `response_format` com JSON Schema e flag `store: false` para privacidade total (sem retenção de dados).

## 4. Catálogo de Variáveis (ContractVariableRegistry)
O catálogo em `src/lib/contract-variables.ts` define rigorosamente as variáveis suportadas:
- **Cliente:** `client.name`, `client.cpf`, `client.rg`, `client.phone`, `client.email`, `client.address`, `client.cep`, `client.city`, `client.state`, `client.cnhNumber`, `client.cnhCategory`, `client.cnhExpiry`, `client.firstLicenseDate`.
- **Veículo:** `vehicle.name`, `vehicle.brand`, `vehicle.model`, `vehicle.year`, `vehicle.yearModel`, `vehicle.plate`, `vehicle.color`, `vehicle.renavam`, `vehicle.chassis`, `vehicle.fuel`, `vehicle.odometer`.
- **Locação:** `rental.startDate`, `rental.startTime`, `rental.endDate`, `rental.endTime`, `rental.contractType`, `rental.periodRate`, `rental.deposit`, `rental.paymentWeekday`, `rental.kmStart`.
- **Empresa:** `company.name`, `company.document`, `company.address`, `company.signerName`, `company.city`.
- **Contrato:** `contract.date`.
- **Campos Manuais:** prefixo `manual.<chave>`, solicitado ao operador antes da emissão.

## 5. Versionamento e Imutabilidade
- Tabela `contract_template_versions` arquiva snapshots completos de cada versão do modelo (arquivo, hash e mapeamento).
- Alterações em um modelo geram uma nova versão (`v2`, `v3`), mantendo os contratos emitidos no passado vinculados à sua versão original.
- Contratos assinados permanecem imutáveis no banco de dados com `contracts_guard`.

## 6. Banco de Dados e Storage
- **Migration:** `supabase/migrations/20261011000000_dynamic_contracts.sql`.
- **Tabelas criadas:** `contract_templates`, `contract_template_versions`, `contract_ai_config`.
- **Tabelas alteradas:** `contracts` (adicionados campos `template_id`, `template_version`, `resolved_snapshot`, `manual_values`).
- **Storage:** Bucket privado `documentos`, pasta `templates/`.
- **RLS:** Modelos e configurações restritos à equipe (`is_staff`); locatários só acessam seus próprios contratos finais.

## 7. Verificação e Testes
- Suíte `scripts/check-contracts.ts`: validação unitária de formatadores (CPF, placa, moeda), catálogo de variáveis, resolução determinística e renderização com substituição literal exata.
- Suíte geral de regressão (Contratos, FIPE, Pagamentos, Asaas, InfinitePay, Selsyn, Lint e Build Next.js): todos aprovados com código de saída 0.
