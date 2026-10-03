# Mapa da Central de Ajuda e Treinamento — LOCAKAR

Auditoria realizada diretamente nos arquivos de código e interfaces reais do projeto em 2026-10-02.
Todas as telas, botões, campos e status descritos existem de fato no código.

## 1. Inventário de módulos e funcionalidades operacionais

| Módulo | Caminho / Rota | Fonte principal | Status de implementação |
|---|---|---|---|
| Dashboard | `/admin` | `src/app/admin/page.tsx` | IMPLEMENTADO |
| Veículos | `/admin/vehicles` | `src/app/admin/vehicles/page.tsx` | IMPLEMENTADO |
| Clientes | `/admin/clients` | `src/app/admin/clients/page.tsx` | IMPLEMENTADO |
| Reservas | `/admin/reservations` | `src/app/admin/reservations/page.tsx` | IMPLEMENTADO |
| Locações | `/admin/rentals` | `src/app/admin/rentals/page.tsx` | IMPLEMENTADO |
| Detalhe da locação | `/admin/rentals/[id]` | `src/app/admin/rentals/[id]/page.tsx` | IMPLEMENTADO |
| Solicitações do app | `/admin/requests` | `src/app/admin/requests/page.tsx` | IMPLEMENTADO |
| Pagamentos | `/admin/pagamentos` | `src/app/admin/pagamentos/page.tsx` | IMPLEMENTADO |
| InfinitePay (detalhe) | `/admin/pagamentos/infinitepay` | `src/app/admin/pagamentos/infinitepay/page.tsx` | IMPLEMENTADO |
| Financeiro | `/admin/finance` | `src/app/admin/finance/page.tsx` | IMPLEMENTADO |
| Despesas | `/admin/expenses` | `src/app/admin/expenses/page.tsx` | IMPLEMENTADO |
| Manutenção | `/admin/maintenance` | `src/app/admin/maintenance/page.tsx` | IMPLEMENTADO |
| Multas | `/admin/fines` | `src/app/admin/fines/page.tsx` | IMPLEMENTADO |
| Anotações | `/admin/notes` | `src/app/admin/notes/page.tsx` | IMPLEMENTADO |
| Ocorrências e documentos | `/admin/incidents` | `src/app/admin/incidents/page.tsx` | IMPLEMENTADO |
| Segurança antifraude | `/admin/security` | `src/app/admin/security/page.tsx` | IMPLEMENTADO |
| Rastreamento | `/admin/monitoring` | `src/app/admin/monitoring/page.tsx` | IMPLEMENTADO (consultas/relatórios) |
| Relatórios | `/admin/reports` | `src/app/admin/reports/page.tsx` | IMPLEMENTADO |
| Configurações (8 abas) | `/admin/settings` | `src/app/admin/settings/page.tsx` | IMPLEMENTADO |
| Assinatura eletrônica | `/assinar/[token]` | `src/app/assinar/[token]/page.tsx` | IMPLEMENTADO |
| Aceite de convite | `/convite/[token]` | `src/app/convite/[token]/page.tsx` | IMPLEMENTADO |
| Vitrine da locadora | `/l/[slug]` | `src/app/l/[slug]/page.tsx` | IMPLEMENTADO |
| Super Admin | `/plataforma/admin` | `src/app/plataforma/admin/page.tsx` | IMPLEMENTADO |
| Cadastro de locadora | `/plataforma/cadastro` | `src/app/plataforma/cadastro/page.tsx` | IMPLEMENTADO |
| App do locatário (Expo) | `/locatario` | `apps/locatario/app/` | IMPLEMENTADO |

## 2. O que NÃO existe (para não documentar como existente)

- Consulta veicular pública direta por placa na tela de cadastro (o botão existe, mas avisa que não está configurada e abre a busca FIPE manual).
- Cadastro de "Modelos de veículo" como entidade separada; o modelo é texto no cadastro do veículo.
- Comandos remotos sobre veículos (bloqueio, corte de ignição, travas) pela Selsyn — apenas consultas e telemetria.
- Alteração dos dados cadastrais (CPF, telefone, e-mail) pelo próprio locatário dentro do app Expo; o app orienta falar pelo WhatsApp.
- Download de APK/links diretos de lojas na interface atual do app.
- OCR com aprovação automática de documentos sem conferência humana.
- IA respondendo de memória fora da base oficial.
