import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { readCache, writeCache } from "./cache";

/**
 * Locadora em que o app abre. Vem do link de divulgação (…/locatario?org=<slug> ou locakar://…?org=<slug>),
 * fica salva no aparelho e vai em todo pedido (header x-org). Só ESCOLHE a locadora:
 * o servidor confere o vínculo do cliente nela. Sem link = LOCAKAR (apps e contas atuais).
 */
export const DEFAULT_ORG = "locakar";
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export interface OrgBrand {
  slug: string;
  name: string;
  logo: string | null;
  logoLight: string | null;
  logoCompact: string | null;
  primary: string | null;
  secondary: string | null;
  accent: string | null;
  whatsapp: string | null;
  email: string | null;
  welcome: string | null;
  support: string | null;
  active: boolean;
}

let current = DEFAULT_ORG;
export const currentOrgSlug = () => current;

function slugFromUrl(url: string | null) {
  if (!url) return null;
  const v = Linking.parse(url).queryParams?.org;
  const s = (Array.isArray(v) ? v[0] : v)?.toString().trim().toLowerCase();
  return s && SLUG.test(s) ? s : null;
}

/** Lê o link de abertura (ou o salvo) e fixa a locadora desta sessão do app. */
export async function initOrg(): Promise<string> {
  const fromLink =
    Platform.OS === "web" && typeof window !== "undefined" ? slugFromUrl(window.location.href) : slugFromUrl(await Linking.getInitialURL());
  const saved = await readCache<string>("org_slug");
  current = fromLink ?? (saved && SLUG.test(saved) ? saved : DEFAULT_ORG);
  if (current !== saved) await writeCache("org_slug", current);
  return current;
}

export async function setOrgSlug(slug: string) {
  if (!SLUG.test(slug)) return;
  current = slug;
  await writeCache("org_slug", slug);
}

/** Marca pública da locadora (antes do login). Falha de rede: usa a última salva. */
export async function fetchOrgBrand(apiUrl: string, slug = current): Promise<OrgBrand | null> {
  const key = `org_brand:${slug}`;
  try {
    const res = await fetch(`${apiUrl}/api/public/org/${encodeURIComponent(slug)}`);
    if (!res.ok) return res.status === 404 ? null : await readCache<OrgBrand>(key);
    const brand = (await res.json()) as OrgBrand;
    await writeCache(key, brand);
    return brand;
  } catch {
    return readCache<OrgBrand>(key);
  }
}
