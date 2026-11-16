/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): NODE_PATH=<pglite> node scripts/sql/vehicle-release.cjs */
// Carro "Alugado" volta a "Disponível" quando a última locação em curso some (excluída, cancelada, finalizada ou trocada).
const { makeDb } = require('./saas-base.cjs');
const assert = require('assert/strict');

(async () => {
  const db = await makeDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const [{ id: a }] = await q(`insert into organizations(slug,name) values ('loca-a','Locadora A') returning id`);
  const car = (id, status) => `insert into vehicles(id,organization_id,name,brand,model,year,image,category,transmission,fuel,seats,plate,status) values ('${id}','${a}','Mobi','Fiat','Mobi',2024,'x','Hatch','Manual','Flex',5,'ABC${id.slice(1)}D23','${status}');`;
  const rent = (id, v, status) => `insert into rentals(id,organization_id,client_id,vehicle_id,contract_type,start_date,end_date,weekly_rate,receipts,status) values ('${id}','${a}','c1','${v}','Semanal','2026-11-01','2026-12-01',360,'[]','${status}');`;
  await db.exec(`insert into clients(id,organization_id,code,name,phone,cpf) values ('c1','${a}',1,'Maria','11999999999','52998224725');`
    + car('v1', 'rented') + car('v2', 'rented') + car('v3', 'rented') + car('v4', 'maintenance') + car('v5', 'rented')
    + rent('r1', 'v1', 'active') + rent('r2', 'v2', 'active') + rent('r2b', 'v2', 'late') + rent('r3', 'v3', 'active') + rent('r4', 'v4', 'active') + rent('r5', 'v5', 'late'));
  const st = async (id) => (await q(`select status from vehicles where id=$1`, [id]))[0].status;

  await q(`delete from rentals where id='r1'`);
  assert.equal(await st('v1'), 'available', 'locação excluída libera o carro');

  await q(`delete from rentals where id='r2'`);
  assert.equal(await st('v2'), 'rented', 'outra locação em curso: continua alugado');

  await q(`update rentals set status='cancelled' where id='r3'`);
  assert.equal(await st('v3'), 'available', 'cancelada libera');

  await q(`delete from rentals where id='r4'`);
  assert.equal(await st('v4'), 'maintenance', 'manutenção nunca é alterada');

  await q(`update rentals set vehicle_id='v1' where id='r5'`);
  assert.equal(await st('v5'), 'available', 'troca de carro libera o antigo');

  await q(`update rentals set end_date='2026-12-15' where id='r2b'`);
  assert.equal(await st('v2'), 'rented', 'editar outros campos não mexe no carro');
  console.log('✓ vehicle-release SQL ok');
})().catch((e) => { console.error(e); process.exit(1); });
