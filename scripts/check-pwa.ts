// Apps instaláveis por locadora: manifest com nome/ícones da locadora e ids que não se misturam.
import assert from "node:assert/strict";
import { brandVersion, orgManifest, pwaPath, shortName } from "../src/lib/pwa-manifest";

const v = brandVersion({ primary: "#ff0000", logo: "https://x/a.png" }, "Rota Sul");
assert.notEqual(v, brandVersion({ primary: "#00ff00", logo: "https://x/a.png" }, "Rota Sul"), "cor nova = ícone novo");
assert.notEqual(v, brandVersion({ primary: "#ff0000", logo: "https://x/b.png" }, "Rota Sul"), "logo novo = ícone novo");
assert.equal(v, brandVersion({ primary: "#ff0000", logo: "https://x/a.png" }, "Rota Sul"), "estável");

assert.equal(shortName("Rota Sul"), "Rota Sul");
assert.equal(shortName("Rota Sul Locadora de Veículos"), "Rota");

const app = orgManifest("app", { slug: "rotasul", name: "Rota Sul Locadora", theme: "light", version: v });
assert.equal(app.name, "Rota Sul Locadora");
assert.equal(app.id, "/locatario?org=rotasul", "um app por locadora");
assert.equal(app.start_url, "/locatario?org=rotasul&source=pwa", "abre na locadora certa");
assert.equal(app.scope, "/locatario");
assert.equal(app.background_color, "#F7F7F8", "tema claro da locadora");
assert.ok(app.icons?.some((i) => i.purpose === "maskable" && i.src === pwaPath("rotasul", "maskable-512.png", v)));
assert.notEqual(orgManifest("app", { slug: "outra", name: "Outra", version: v }).id, app.id, "apps de locadoras diferentes não se sobrescrevem");

const admin = orgManifest("admin", { slug: "rotasul", name: "Rota Sul", version: v });
assert.equal(admin.name, "Rota Sul · Gestão");
assert.equal(admin.short_name, "Rota Sul");
assert.equal(admin.scope, "/admin");
assert.equal(admin.id, "/admin/", "um app de gestão por aparelho");

console.log("✓ pwa ok");
