/* eslint-disable @typescript-eslint/no-require-imports -- testes SQL offline (PGlite): NODE_PATH=<pglite> node scripts/sql/whatsapp-inbox.cjs */
// Conversas do WhatsApp: chave por locadora+provedor+contato, modo/etiquetas válidos, mensagem sem duplicar, só servidor.
const { makeDb } = require('./saas-base.cjs');
const assert = require('assert/strict');

(async () => {
  const db = await makeDb();
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const [{ id: a }] = await q(`insert into organizations(slug,name) values ('loca-a','Locadora A') returning id`);
  const [{ id: b }] = await q(`insert into organizations(slug,name) values ('loca-b','Locadora B') returning id`);
  const jid = '5511999990000@s.whatsapp.net';
  const conv = (org, extra = '', vals = []) => q(`insert into whatsapp_conversations(organization_id,provider,jid${extra}) values ($1,'evolution',$2${vals.map((_, i) => `,$${i + 3}`).join('')})`, [org, jid, ...vals]);

  await conv(a);
  await conv(b); // mesmo contato em outra locadora: conversa separada
  await assert.rejects(conv(a), /duplicate/, 'uma conversa por contato/provedor/locadora');
  await q(`insert into whatsapp_conversations(organization_id,provider,jid) values ($1,'whaileys',$2)`, [a, jid]);
  await assert.rejects(q(`insert into whatsapp_conversations(organization_id,provider,jid) values ($1,'telegram',$2)`, [a, jid]), /check/);
  await assert.rejects(q(`insert into whatsapp_conversations(organization_id,provider,jid) values ($1,'evolution','123-456@g.us')`, [a]), /check/, 'grupo recusado');
  await assert.rejects(q(`update whatsapp_conversations set mode='robo' where organization_id=$1`, [a]), /check/);
  await assert.rejects(q(`update whatsapp_conversations set labels=$2 where organization_id=$1`, [a, Array.from({ length: 11 }, (_, i) => `L${i}`)]), /check/, 'até 10 etiquetas');
  const [d] = await q(`select mode, labels from whatsapp_conversations where organization_id=$1 and provider='evolution'`, [a]);
  assert.deepEqual(d, { mode: 'human', labels: [] }, 'padrão do banco: humano, sem etiquetas');

  const msg = (org, id) => q(`insert into whatsapp_messages(organization_id,provider,jid,provider_id,from_me,text) values ($1,'evolution',$2,$3,false,'oi')`, [org, jid, id]);
  await msg(a, 'M1');
  await assert.rejects(msg(a, 'M1'), /duplicate/, 'webhook repetido não duplica');
  await msg(b, 'M1');
  await assert.rejects(q(`insert into whatsapp_messages(organization_id,provider,jid,provider_id,from_me,text) values ($1,'evolution','5511888880000@s.whatsapp.net','M2',false,'x')`, [a]), /foreign key/, 'mensagem só em conversa existente');

  await db.exec(`set role authenticated`);
  await assert.rejects(db.query(`select * from whatsapp_conversations`), /permission denied/);
  await assert.rejects(db.query(`select * from whatsapp_messages`), /permission denied/);
  await db.exec(`reset role`);
  console.log('✓ whatsapp-inbox SQL ok');
})().catch((e) => { console.error(e); process.exit(1); });
