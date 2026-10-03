# Backup, ordem de deploy e rollback — multiempresa

## 0. Antes de tudo: backup
1. Supabase → **Database → Backups**: confirme backup diário recente (Pro tem PITR). No plano Free, faça o dump:
   ```bash
   npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup-schema.sql
   npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f backup-data.sql
   ```
   `SUPABASE_DB_URL` = Project Settings → Database → Connection string (URI). **Nunca** commitar esses arquivos.
2. Guarde as contagens atuais (SQL Editor):
   ```sql
   select 'vehicles' t, count(*) from vehicles union all select 'clients', count(*) from clients
   union all select 'rentals', count(*) from rentals union all select 'contracts', count(*) from contracts
   union all select 'payment_transactions', count(*) from payment_transactions;
   ```

## Ordem segura (cada passo é uma transação: se falhar, nada fica pela metade)
| # | O quê | Onde | Observação |
|---|---|---|---|
| 1 | `20261012100000_fix_client_link_takeover.sql` | SQL Editor | correção de segurança; pode ir já |
| 2 | `20261013000000_saas_core.sql` | SQL Editor | cria a locadora LOCAKAR e migra a equipe (`staff`) como dona e Super Admin |
| 3 | `20261013000100_saas_tenancy.sql` | SQL Editor | backfill + RLS + Storage. **Aborta sozinho** se alguma contagem divergir |
| 4 | Deploy do código (push na `main`) | Vercel | o app antigo continua funcionando entre 3 e 4 (registros sem locadora caem na LOCAKAR) |
| 5 | Testar: login, dashboard, criar/editar veículo, cobrança, app do locatário | — | |
| 6 | `20261013000200_saas_strict.sql` | SQL Editor | só depois do passo 5: desliga o fallback LOCAKAR (gravação sem locadora passa a falhar) |

Conferir o backfill após o passo 3:
```sql
select * from saas_migration_counts order by table_name;  -- before_count = after_count, null_count = 0
```

## Variáveis na Vercel
Nenhuma nova obrigatória. Opcional: `NEXT_PUBLIC_SITE_URL` (links em e-mails/webhooks; padrão `https://www.locakar.com.br`).

## Asaas após o deploy
A URL do webhook passa a levar `?o=<id-da-locadora>`. O webhook atual (sem `?o=`) continua funcionando para a LOCAKAR. Ao clicar **Testar conexão** em Configurações → Pagamentos → Asaas, o webhook é atualizado automaticamente.

## Rollback
- **Código**: Vercel → Deployments → "Promote" do deploy anterior.
- **Passo 6**: `update platform_config set legacy_fallback = true where id = 1;`
- **Passos 2–3** (só se **nenhuma** outra locadora tiver sido criada): restaurar o backup do passo 0. Se já houver outra locadora, **não** reverter: corrigir para frente.
- Arquivos do Storage nunca foram movidos.
