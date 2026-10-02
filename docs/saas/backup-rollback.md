# Backup e rollback — migração multiempresa

## Antes de rodar qualquer migration `saas_*`
1. Supabase → **Database → Backups**: confirme que há backup diário recente (plano Pro tem PITR; no Free, faça o dump abaixo).
2. Dump lógico local (opcional, recomendado):
   ```bash
   npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-schema.sql
   npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f backup-data.sql
   ```
   `SUPABASE_DB_URL` = Project Settings → Database → Connection string (URI). Nunca commitar esses arquivos.
3. Contagens de referência (SQL Editor) — guarde o resultado:
   ```sql
   select 'vehicles' t, count(*) from vehicles union all
   select 'clients', count(*) from clients union all
   select 'rentals', count(*) from rentals union all
   select 'reservations', count(*) from reservations union all
   select 'expenses', count(*) from expenses union all
   select 'maintenance', count(*) from maintenance union all
   select 'fines', count(*) from fines union all
   select 'contracts', count(*) from contracts union all
   select 'payment_receipts', count(*) from payment_receipts union all
   select 'payment_transactions', count(*) from payment_transactions;
   ```

## Ordem segura
| Passo | Arquivo | Reversível? |
|---|---|---|
| 0 | `20261012100000_fix_client_link_takeover.sql` | sim (só função) |
| 1 | `20261013000000_saas_core.sql` | sim — tabelas novas, nada existente muda |
| 2 | `20261013000100_saas_backfill.sql` | sim — colunas nulas + update; aborta sozinho se contagens divergirem |
| — | deploy do código tenant-aware | rollback = redeploy anterior na Vercel |
| 3 | `20261013000200_saas_rls.sql` | parcial — ver abaixo |

Cada migration roda em transação: se falhar, nada fica pela metade.

## Rollback
- **Passos 1–2:** `docs/saas/down.sql` remove colunas `organization_id` e tabelas novas (dados originais intactos, nunca foram movidos).
- **Passo 3:** restaurar policies `equipe_total` (seção "down" no fim de `20261013000200_saas_rls.sql`). Se houver dados de outra locadora já criados, **não** rodar down: restaurar backup.
- Arquivos do Storage nunca são movidos: caminhos antigos continuam válidos.
