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
    // Checkouts de agentes não fazem parte da aplicação atual.
    ".claude/worktrees/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // App do Locatário (Expo): tem tsconfig, dependências e regras próprias em apps/locatario.
    "apps/**",
    // Bundle web gerado por `npm run build:locatario`.
    "public/locatario/**",
    // Workers/WASM gerados a partir de dependências versionadas, não código autoral.
    "public/vendor/crlv/**",
  ]),
  // Microserviço Node puro (sem React): regras de hooks não se aplicam a useMultiFileAuthState.
  { files: ["services/**"], rules: { "react-hooks/rules-of-hooks": "off" } },
]);

export default eslintConfig;
