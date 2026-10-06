/* eslint-disable @typescript-eslint/no-require-imports -- runner CommonJS independente do Next */
// O marcador server-only impede import normal fora do Next. Substituído apenas neste runner offline.
const { createJiti } = require("jiti");
const path = require("node:path");
const run = createJiti(__filename, { alias: { "server-only": path.resolve(__dirname, "../node_modules/server-only/empty.js"), "@/": path.resolve(__dirname, "../src") + "/" } });
run.import(path.resolve(__dirname, "check-selsyn.ts")).catch(error => { console.error(error); process.exitCode = 1; });
