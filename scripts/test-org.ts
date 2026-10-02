/** Locadora fictícia para as suítes offline: funções de servidor exigem locadora no contexto (fail-closed). */
import { runWithOrg } from "../src/lib/server/org-context";
import type { Organization } from "../src/types";

export const TEST_ORG: Organization = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "teste",
  name: "Locadora Teste",
  legal_name: "Locadora Teste LTDA",
  document: null,
  email: "teste@example.com",
  phone: null,
  whatsapp: "5519999999999",
  website: null,
  address: null,
  city: null,
  state: null,
  cep: null,
  status: "active",
  branding: { displayName: "Locadora Teste", primary: "#2563eb" },
  texts: {},
  onboarding: {},
  created_at: "2026-10-01T00:00:00.000Z",
};

export const inTestOrg = <T>(fn: () => Promise<T>) => runWithOrg({ org: TEST_ORG }, fn);
