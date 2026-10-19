/* eslint-disable @typescript-eslint/no-require-imports -- prepara assets locais do OCR/PDF, sem rede */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "public/vendor/crlv");
fs.mkdirSync(out, { recursive: true });
const copy = (from, name) => fs.copyFileSync(path.join(root, from), path.join(out, name));
copy("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "pdf.worker.min.mjs");
copy("node_modules/tesseract.js/dist/worker.min.js", "worker.min.js");
const core = "node_modules/tesseract.js-core";
for (const name of fs.readdirSync(path.join(root, core)).filter(n => /^tesseract-core.*\.wasm(?:\.js)?$/.test(n))) copy(`${core}/${name}`, name);
copy("node_modules/@tesseract.js-data/por/4.0.0/por.traineddata.gz", "por.traineddata.gz");
// Tudo da mesma origem; nenhum CRLV é enviado a serviço externo.
console.log("Assets CRLV locais preparados.");
