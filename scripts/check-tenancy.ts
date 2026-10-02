/** Multiempresa (offline): orgDb filtra/carimba a locadora, serviceDb exige contexto, contraste WCAG. */
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { brandTokens, brandWarnings, contrastRatio, ensureContrast, onColor } from "../src/lib/contrast";
import { can } from "../src/lib/permissions";
import { orgDb, orgIdOf } from "../src/lib/server/org-db";
import { currentOrg, runWithOrg, scoped, setOrg } from "../src/lib/server/org-context";
import { TEST_ORG } from "./test-org";

type Call = { table: string; op: string; args: unknown[]; filters: [string, unknown][] };
function fakeDb() {
  const calls: Call[] = [];
  const builder = (table: string, op: string, args: unknown[]) => {
    const call: Call = { table, op, args, filters: [] };
    calls.push(call);
    const b: Record<string, unknown> = {
      eq: (k: string, v: unknown) => (call.filters.push([k, v]), b),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
    };
    return b;
  };
  const db = {
    from: (table: string) => ({
      select: (...a: unknown[]) => builder(table, "select", a),
      update: (...a: unknown[]) => builder(table, "update", a),
      delete: (...a: unknown[]) => builder(table, "delete", a),
      insert: (...a: unknown[]) => builder(table, "insert", a),
      upsert: (...a: unknown[]) => builder(table, "upsert", a),
    }),
    rpc: () => Promise.resolve({ data: null, error: null }),
  };
  return { db: db as unknown as SupabaseClient, calls };
}

(async () => {
  const A = TEST_ORG.id, B = "22222222-2222-4222-8222-222222222222";
  const { db, calls } = fakeDb();
  const a = orgDb(db, A);
  assert.equal(orgIdOf(a), A);
  await a.from("vehicles").select("*");
  await a.from("vehicles").update({ name: "x" });
  await a.from("rentals").delete();
  await a.from("clients").insert({ name: "c", organization_id: B }); // tentativa de forjar
  await a.from("settings").upsert([{ data: {} }, { data: {}, organization_id: B }]);
  await a.from("organizations").select("*"); // tabela da plataforma: sem filtro
  const byOp = (t: string, op: string) => calls.find((c) => c.table === t && c.op === op)!;
  for (const [t, op] of [["vehicles", "select"], ["vehicles", "update"], ["rentals", "delete"]]) {
    assert.deepEqual(byOp(t, op).filters, [["organization_id", A]], `${t}.${op} filtra pela locadora`);
  }
  assert.equal((byOp("clients", "insert").args[0] as { organization_id: string }).organization_id, A, "insert ignora organization_id forjado");
  assert.deepEqual((byOp("settings", "upsert").args[0] as { organization_id: string }[]).map((r) => r.organization_id), [A, A]);
  assert.deepEqual(byOp("organizations", "select").filters, []);
  assert.throws(() => orgDb(db, "nao-e-uuid"), /inválida/);

  // serviceDb sem contexto falha (nunca vira acesso global)
  process.env.SUPABASE_SECRET_KEY ||= "sb_secret_test";
  const { serviceDb } = await import("../src/lib/server/push");
  assert.throws(() => serviceDb(), /fora do contexto/);
  await runWithOrg({ org: TEST_ORG }, async () => assert.equal(orgIdOf(serviceDb()), A));

  // Contexto isolado por requisição; não troca de locadora no meio
  const handler = scoped(async (id: string) => {
    assert.equal(currentOrg(), undefined, "requisição começa sem locadora");
    setOrg({ org: { ...TEST_ORG, id } });
    await new Promise((r) => setTimeout(r, Math.random() * 5));
    assert.throws(() => setOrg({ org: { ...TEST_ORG, id: id === A ? B : A } }), /já definida/);
    return currentOrg()!.org.id;
  });
  const ids = Array.from({ length: 50 }, (_, i) => (i % 2 ? A : B));
  assert.deepEqual(await Promise.all(ids.map((id) => handler(id))), ids, "50 requisições concorrentes sem vazamento");

  // Papéis
  assert.ok(can("owner", "settings") && can("admin", "team"));
  assert.ok(!can("operator", "settings") && !can("viewer", "operate") && !can("finance", "operate"));
  assert.ok(can("finance", "finance") && can("manager", "finance"));

  // Contraste WCAG: amarelo pede texto escuro; tons ajustados atingem 4.5:1
  assert.equal(onColor("#facc15"), "#0f172a");
  assert.equal(onColor("#1e3a8a"), "#ffffff");
  assert.ok(contrastRatio("#000000", "#ffffff") > 20);
  assert.ok(contrastRatio(ensureContrast("#fde047", "#ffffff"), "#ffffff") >= 4.5);
  assert.ok(contrastRatio(ensureContrast("#1e1b4b", "#0d0d0f"), "#0d0d0f") >= 4.5);
  const t = brandTokens({ primary: "#facc15" }, "light")!;
  assert.equal(t["--theme-on-brand"], "#0f172a");
  assert.ok(contrastRatio(t["--theme-brand-soft"], "#ffffff") >= 4.5);
  assert.equal(brandTokens({ primary: "javascript:alert(1)" }, "dark"), null, "cor inválida ignorada");
  assert.ok(brandWarnings({ primary: "#fefefe" }).length > 0, "cor quase branca gera aviso");

  console.log("✓ multiempresa offline: orgDb filtra/carimba, serviceDb fail-closed, contexto isolado, papéis, contraste");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
