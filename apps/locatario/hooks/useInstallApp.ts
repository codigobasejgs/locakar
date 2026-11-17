/** App nativo (loja): já é instalado, nada a fazer. A versão web está em useInstallApp.web.ts. */
export function useOrgAppHead(_slug: string, _name: string | undefined) {}

export function useInstallApp(): { mode: "prompt" | "ios" | null; install: () => Promise<boolean> } {
  return { mode: null, install: async () => false };
}
