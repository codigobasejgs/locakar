import { can } from "@/lib/permissions";
import type { HelpAccess, HelpArticle } from "./types";

export function canReadArticle(article: HelpArticle, access: HelpAccess) {
  if (access.audience === "tenant") return article.audience === "tenant";
  if (article.audience === "tenant") return false;
  if (article.audience === "platform") return access.platformAdmin;
  return Boolean(access.role && can(access.role, article.permission));
}
export function featureAvailable(article: HelpArticle, access: HelpAccess) {
  return !article.feature || access.modules?.[article.feature] !== false;
}
export function routeMatches(pattern: string, current: string) {
  const [path, hash] = current.split("#");
  const [base, expectedHash] = pattern.split("#");
  if (expectedHash && expectedHash !== hash) return false;
  const a = base.split("/"); const b = path.split("/");
  return a.length === b.length && a.every((segment, i) => /^\[[^\]]+\]$/.test(segment) ? Boolean(b[i]) : segment === b[i]);
}
export function contextualArticles(articles: HelpArticle[], route: string, access: HelpAccess) {
  return articles.filter((a) => canReadArticle(a, access) && featureAvailable(a, access) && a.routes.some((r) => routeMatches(r, route)));
}
