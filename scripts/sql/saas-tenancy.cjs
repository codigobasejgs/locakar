/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): npx -p @electric-sql/pglite node scripts/sql/saas-tenancy.cjs */
// Isolamento multiempresa: backfill LOCAKAR + Empresas A/B + IDOR por UUID + storage + RPCs.
const { makeDb, as } = require('./saas-base.cjs');
const assert = require('assert/strict');
const user = async (db, email, meta = {}) => (await db.query(`insert into auth.users(email, email_confirmed_at, raw_user_meta_data) values ($1, now(), $2) returning id`, [email, JSON.stringify(meta)])).rows[0].id;
const one = async (q) => (await q).rows[0];

(async () => {
  // ---------- 1. Dados legados antes da migração SaaS ----------
  const db = await makeDb({ upTo: '20261012100000_fix_client_link_takeover.sql' });
  const staff = await user(db, 'dono@locakar.com');
  await db.query(`insert into staff values ($1)`, [staff]);
  await db.exec(`update settings set data = '{"company":{"legalName":"LOCAKAR LTDA","cnpj":"00.000.000/0001-91","email":"a@b.com"},"pix":{"key":"x","enabled":true}}' where id = 1`);
  await db.exec(`
    insert into vehicles(id,name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('v0','Mobi','Fiat','Mobi',2024,'x','Hatch','Manual','Flex',5,'ABC1D23');
    insert into clients(id,code,name,phone,cpf,email) values ('c0',1,'Cliente Legado','1','52998224725','leg@x.com');
    insert into rentals(id,client_id,vehicle_id,contract_type,start_date,end_date,weekly_rate) values ('r0','c0','v0','Semanal','2026-10-01','2026-10-08',700);
    insert into contracts(id,rental_id,content,client_name,client_cpf,token) values ('k0','r0','Contrato','Cliente Legado','52998224725', repeat('a',48));
    insert into payment_receipts(id,rental_id,receipt_id,client_id,amount,proof_url) values ('p0','r0','x','c0',700,'c0/p.jpg');`);
  // Contrato JÁ ASSINADO (contracts_guard bloqueia update): o backfill precisa passar sem alterar o conteúdo
  await db.exec(`insert into contracts(id,rental_id,content,client_name,client_cpf,token) values ('k1','r0','Assinado','Cliente Legado','52998224725', repeat('b',48));
    update contracts set status='signed', signed_at=now(), updated_at='2026-01-01' where id='k1';`);
  const signedBefore = (await db.query(`select content_hash, updated_at, signed_at from contracts where id='k1'`)).rows[0];
  const before = await one(db.query(`select (select count(*) from vehicles)::int v, (select count(*) from clients)::int c, (select count(*) from rentals)::int r, (select count(*) from contracts)::int k`));

  // ---------- 2. Migração SaaS (2x: idempotente) ----------
  const fs = require('fs'); const { M } = require('./saas-base.cjs');
  for (const f of fs.readdirSync(M).filter(f => f > '20261012100000_fix_client_link_takeover.sql' && f.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(M + f, 'utf8');
    try { await db.exec(sql); await db.exec(sql); } catch (e) { e.message = `[${f}] ${e.message}`; throw e; }
  }
  const after = await one(db.query(`select (select count(*) from vehicles)::int v, (select count(*) from clients)::int c, (select count(*) from rentals)::int r, (select count(*) from contracts)::int k`));
  assert.deepEqual(after, before, 'contagens preservadas');
  const signedAfter = (await db.query(`select content_hash, updated_at, signed_at, status, organization_id is not null has_org from contracts where id='k1'`)).rows[0];
  assert.equal(signedAfter.status, "signed"); assert.ok(signedAfter.has_org);
  assert.equal(signedAfter.content_hash, signedBefore.content_hash, "hash do contrato assinado intacto");
  assert.deepEqual(signedAfter.updated_at, signedBefore.updated_at, "updated_at não muda no backfill");
  await assert.rejects(db.query(`update contracts set content='x' where id='k1'`), /assinado/, "guard religado após backfill");
  const loca = (await one(db.query(`select id, name, legal_name, document from organizations where slug='locakar'`)));
  assert.equal(loca.legal_name, 'LOCAKAR LTDA'); assert.equal(loca.document, '00000000000191');
  assert.equal((await one(db.query(`select count(*)::int n from vehicles where organization_id <> $1 or organization_id is null`, [loca.id]))).n, 0);
  assert.equal((await one(db.query(`select role from memberships where user_id=$1`, [staff]))).role, 'owner');
  const counts = (await db.query(`select * from saas_migration_counts where before_count <> after_count or null_count > 0`)).rows;
  assert.equal(counts.length, 0);

  // ---------- 3. Empresa B via cadastro self-service ----------
  const ownerB = await user(db, 'dono@b.com');
  const orgB = (await one(db.query(`select public.create_organization($1,'Locadora B','locadora-b','11999990000') id`, [ownerB]))).id;
  await assert.rejects(db.query(`select public.create_organization($1,'Outra','outra-b')`, [ownerB]), /já criou/);
  await assert.rejects(db.query(`select public.create_organization($1,'Dup','locadora-b')`, [await user(db, 'x@y.com')]), /em uso/);
  const unconf = (await one(db.query(`insert into auth.users(email) values ('nc@x.com') returning id`))).id;
  await assert.rejects(db.query(`select public.create_organization($1,'NC','nao-conf')`, [unconf]), /Confirme/);
  assert.equal((await one(db.query(`select status from organizations where id=$1`, [orgB]))).status, 'trial');
  assert.ok((await one(db.query(`select trial_ends_at > now() + interval '29 days' ok from subscriptions where organization_id=$1`, [orgB]))).ok);

  // Admin B cria dados pelo navegador (RLS, sem informar organization_id)
  await as(db, ownerB, async () => {
    await db.exec(`insert into vehicles(id,name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('vB','Kwid','Renault','Kwid',2024,'x','Hatch','Manual','Flex',5,'ABC1D23')`); // mesma placa da A: ok (por locadora)
    await db.exec(`insert into clients(id,name,phone,cpf) values ('cB','Cliente B','2','52998224725')`); // mesmo CPF: ok
    await db.exec(`insert into rentals(id,client_id,vehicle_id,contract_type,start_date,end_date,weekly_rate) values ('rB','cB','vB','Semanal','2026-10-01','2026-10-08',500)`);
  });
  assert.equal((await one(db.query(`select organization_id from vehicles where id='vB'`))).organization_id, orgB);
  assert.equal((await one(db.query(`select code from clients where id='cB'`))).code, 1, 'código por locadora');

  // ---------- 4. IDOR: A não vê/altera B e vice-versa ----------
  for (const [uid, mine, other] of [[staff, ['v0', 'c0', 'r0'], ['vB', 'cB', 'rB']], [ownerB, ['vB', 'cB', 'rB'], ['v0', 'c0', 'r0']]]) {
    await as(db, uid, async () => {
      const [v, c, r] = other;
      assert.equal((await db.query(`select * from vehicles where id=$1`, [v])).rows.length, 0, 'select por UUID alheio');
      assert.equal((await db.query(`select * from clients where id=$1`, [c])).rows.length, 0);
      assert.equal((await db.query(`select * from rentals where id=$1`, [r])).rows.length, 0);
      assert.equal((await db.query(`update vehicles set name='hack' where id=$1 returning id`, [v])).rows.length, 0, 'update alheio');
      assert.equal((await db.query(`delete from rentals where id=$1 returning id`, [r])).rows.length, 0, 'delete alheio');
      assert.equal((await db.query(`select * from vehicles`)).rows.length, 1);
      assert.equal((await db.query(`select * from settings`)).rows.length, 1, 'só as próprias configurações');
      // Mistura: locação com cliente próprio + veículo alheio
      await assert.rejects(db.query(`insert into rentals(client_id,vehicle_id,contract_type,start_date,end_date,weekly_rate) values ($1,$2,'Semanal','2026-10-01','2026-10-08',1)`, [mine[1], v]), /outra locadora|row-level/);
      // organization_id forjado
      const otherOrg = uid === staff ? orgB : loca.id;
      await assert.rejects(db.query(`insert into vehicles(name,brand,model,year,image,category,transmission,fuel,seats,plate,organization_id) values ('x','x','x',2024,'x','x','x','x',5,'ZZZ9Z99',$1)`, [otherOrg]), /row-level/);
      await assert.rejects(db.query(`update vehicles set organization_id=$1 where id=$2`, [otherOrg, mine[0]]), /não pode ser alterada|row-level/);
    });
  }
  assert.equal((await one(db.query(`select name from vehicles where id='vB'`))).name, 'Kwid');
  // Mesmo via service role a mistura é recusada
  await assert.rejects(db.query(`insert into rentals(client_id,vehicle_id,contract_type,start_date,end_date,weekly_rate) values ('c0','vB','Semanal','2026-10-01','2026-10-08',1)`), /outra locadora/);

  // ---------- 5. Papéis ----------
  const viewerB = await user(db, 'v@b.com');
  await db.query(`insert into memberships values ($1,$2,'viewer')`, [orgB, viewerB]);
  await as(db, viewerB, async () => {
    assert.equal((await db.query(`select * from vehicles`)).rows.length, 1);
    await assert.rejects(db.query(`insert into notes(date,time,description) values ('2026-10-01','10:00','x')`), /row-level/);
    assert.equal((await db.query(`update vehicles set name='x' returning id`)).rows.length, 0);
  });
  const opB = await user(db, 'op@b.com');
  await db.query(`insert into memberships values ($1,$2,'operator')`, [orgB, opB]);
  await as(db, opB, async () => {
    await db.exec(`insert into notes(date,time,description) values ('2026-10-01','10:00','ok')`);
    assert.equal((await db.query(`update settings set data = '{}' returning organization_id`)).rows.length, 0, 'operador não altera configurações');
  });
  await as(db, ownerB, async () => assert.equal((await db.query(`update settings set data = data || '{"pageSize":20}' returning organization_id`)).rows.length, 1));

  // Suspensão bloqueia escrita, não apaga
  await db.query(`update organizations set status='suspended' where id=$1`, [orgB]);
  await as(db, ownerB, async () => {
    assert.equal((await db.query(`select * from vehicles`)).rows.length, 1, 'lê após suspensão');
    await assert.rejects(db.query(`insert into notes(date,time,description) values ('2026-10-01','10:00','x')`), /row-level/);
  });
  await db.query(`update organizations set status='trial' where id=$1`, [orgB]);

  // ---------- 6. Locatário em duas locadoras ----------
  const tenant = await user(db, 'leg@x.com', { cpf: '52998224725', name: 'Cliente Legado' });
  await db.exec(`update clients set email='leg@x.com' where id='cB'`);
  const cA = (await as(db, tenant, () => db.query(`select public.ensure_client_for_current_user() id`))).rows[0].id;
  assert.equal(cA, 'c0', 'sem slug = LOCAKAR (apps atuais)');
  const cB = (await as(db, tenant, () => db.query(`select public.ensure_client_for_current_user('locadora-b') id`))).rows[0].id;
  assert.equal(cB, 'cB');
  await as(db, tenant, async () => {
    assert.equal((await db.query(`select * from my_tenant_organizations()`)).rows.length, 2);
    assert.equal((await one(db.query(`select public.current_client_id() id`))).id, 'cB', 'ativa = B');
    assert.equal((await db.query(`select * from tenant_rentals`)).rows.map(r => r.id).join(), 'rB');
    assert.deepEqual((await db.query(`select id from tenant_fleet`)).rows.map(r => r.id), ['vB'], 'frota só da locadora ativa');
    await db.query(`select public.set_active_organization($1)`, [loca.id]);
    assert.equal((await db.query(`select * from tenant_rentals`)).rows.map(r => r.id).join(), 'r0');
    await assert.rejects(db.query(`select public.set_active_organization(gen_random_uuid())`), /não tem acesso/);
    assert.equal((await db.query(`select * from vehicles`)).rows.length, 0, 'locatário não lê tabela de veículos');
    assert.equal((await db.query(`select * from payment_receipts`)).rows.length, 1);
  });
  // Locatário sem vínculo naquela locadora: CPF já existe com outro e-mail → não vincula
  const imp = await user(db, 'imp@x.com', { cpf: '52998224725' });
  assert.equal((await as(db, imp, () => db.query(`select public.ensure_client_for_current_user('locadora-b') id`))).rows[0].id, null);

  // ---------- 7. Storage ----------
  await db.exec(`insert into storage.objects(bucket_id,name) values ('documentos','crlv/ABC.pdf'),('documentos','${orgB}/crlv/B.pdf'),('comprovantes','c0/p.jpg'),('comprovantes','cB/p.jpg'),('documentos','templates/t.pdf')`);
  await as(db, staff, async () => {
    const names = (await db.query(`select name from storage.objects order by name`)).rows.map(r => r.name);
    assert.ok(names.includes('crlv/ABC.pdf') && names.includes('templates/t.pdf') && names.includes('c0/p.jpg'), 'LOCAKAR lê legados e do próprio cliente');
    assert.ok(!names.includes('cB/p.jpg'), 'A não lê comprovante de cliente B');
    assert.ok(!names.includes(`${orgB}/crlv/B.pdf`), 'A não lê arquivo de B');
    await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values ('documentos','${orgB}/x.pdf')`), /row-level/);
  });
  await as(db, ownerB, async () => {
    const names = (await db.query(`select name from storage.objects`)).rows.map(r => r.name);
    assert.ok(names.includes(`${orgB}/crlv/B.pdf`) && !names.includes('crlv/ABC.pdf') && !names.includes('templates/t.pdf'), 'B não lê legados da LOCAKAR');
    await db.query(`insert into storage.objects(bucket_id,name) values ('documentos','${orgB}/ok.pdf')`);
    await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values ('documentos','crlv/legado.pdf')`), /row-level/);
  });

  // ---------- 8. RPCs e integrações ----------
  await db.query(`select public.set_payment_method_enabled($1,'pix_manual',false)`, [orgB]);
  await db.query(`select public.set_payment_method_enabled($1,'infinitepay',true)`, [orgB]);
  const sA = (await one(db.query(`select data from settings where organization_id=$1`, [loca.id]))).data;
  const sB = (await one(db.query(`select data from settings where organization_id=$1`, [orgB]))).data;
  assert.equal(sA.pix.enabled, true); assert.equal(sB.pix.enabled, false); assert.equal(sB.infinitepay.enabled, true);
  assert.equal((await db.query(`select organization_id from asaas_config`)).rows.length, 2, 'Asaas por locadora');
  const view = (await one(db.query(`select public.contract_for_signing($1) v`, ['a'.repeat(48)]))).v;
  assert.equal(view.brand.name, 'LOCAKAR');
  // Limite do plano
  await db.query(`update plans set entitlements = entitlements || '{"maxVehicles":1}' where id='trial'`);
  await as(db, ownerB, () => assert.rejects(db.query(`insert into vehicles(name,brand,model,year,image,category,transmission,fuel,seats,plate) values ('x','x','x',2024,'x','x','x','x',5,'BBB1B11')`), /Limite do plano/));
  // Trial vencido → past_due → suspended
  await db.query(`update subscriptions set trial_ends_at = now() - interval '1 day' where organization_id=$1`, [orgB]);
  assert.equal((await one(db.query(`select public.expire_trials() r`))).r.past_due, 1);
  await db.query(`update subscriptions set trial_ends_at = now() - interval '30 days' where organization_id=$1`, [orgB]);
  assert.equal((await one(db.query(`select public.expire_trials() r`))).r.suspended, 1);
  assert.equal((await one(db.query(`select status from organizations where id=$1`, [loca.id]))).status, 'active', 'LOCAKAR intocada');
  // Convite
  const crypto = require('crypto'); const tok = crypto.randomBytes(24).toString('hex'); const h = crypto.createHash('sha256').update(tok).digest('hex');
  await db.query(`insert into organization_invites(organization_id,email,role,token_hash) values ($1,'novo@a.com','finance',$2)`, [loca.id, h]);
  const intruso = await user(db, 'intruso@a.com');
  await assert.rejects(db.query(`select public.accept_invite($1,'intruso@a.com',$2)`, [intruso, h]), /outro e-mail/);
  const novo = await user(db, 'novo@a.com');
  assert.equal((await one(db.query(`select public.accept_invite($1,'novo@a.com',$2) o`, [novo, h]))).o, loca.id);
  await assert.rejects(db.query(`select public.accept_invite($1,'novo@a.com',$2)`, [novo, h]), /inválido/);
  // Tabelas de segredo continuam fechadas
  await as(db, ownerB, async () => {
    for (const t of ['asaas_config', 'contract_ai_config', 'platform_config', 'rate_limits']) await assert.rejects(db.query(`select * from ${t}`), /permission denied/);
    assert.equal((await db.query(`select * from organizations`)).rows.length, 1, 'só vê a própria locadora');
  });

  console.log('OK multiempresa: backfill, IDOR, papéis, suspensão, locatário multi-locadora, storage, RPCs, limites, trial, convites');
  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
