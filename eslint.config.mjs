import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-help/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // App do Locatário (Expo): tem tsconfig, dependências e regras próprias em apps/locatario.
    "apps/**",
    // Bundle web gerado por `npm run build:locatario`.
    "public/locatario/**",
  ]),
]);

export default eslintConfig;
