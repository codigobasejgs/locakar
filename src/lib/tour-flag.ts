import { useSyncExternalStore } from "react";

/**
 * Sinaliza que o tour guiado está aberto. Com ele aberto, as janelas (Dialog) deixam de prender o foco
 * e os cliques, para o balão do tour continuar utilizável por mouse e teclado sobre um formulário aberto.
 */
let active = false;
const subs = new Set<() => void>();
export function setTourActive(value: boolean) {
  if (active === value) return;
  active = value;
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
export const useTourActive = () => useSyncExternalStore(subscribe, () => active, () => false);

/** Rota atual com a aba (#hash), atualizada quando a aba muda. Vazia no servidor. */
export function useCurrentRoute(pathname: string) {
  return useSyncExternalStore(
    (f) => {
      window.addEventListener("hashchange", f);
      // replaceState (troca de aba em Configurações) não dispara hashchange: confere a cada meio segundo.
      const id = window.setInterval(f, 500);
      return () => {
        window.removeEventListener("hashchange", f);
        window.clearInterval(id);
      };
    },
    () => pathname + window.location.hash,
    () => pathname,
  );
}
