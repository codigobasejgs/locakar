import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import { readCache, writeCache } from "../services/cache";
import { useLocatario } from "./useLocatario";

/**
 * GET de uma rota /api/tenant/* com cópia offline e recarga automática (tempo real / puxar para atualizar).
 * Sem internet: mantém a última resposta salva e mostra o erro.
 */
export function useApi<T>(path: string) {
  const { version } = useLocatario();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const fresh = await api<T>(path);
      setData(fresh);
      setError(null);
      writeCache(path, fresh);
    } catch (e) {
      setError((e as Error).message);
      const cached = await readCache<T>(path);
      setData((d) => d ?? cached);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    let alive = true;
    readCache<T>(path).then((cached) => alive && cached && setData((d) => d ?? cached));
    reload();
    return () => {
      alive = false;
    };
  }, [path, reload, version]);

  return { data, error, loading, reload };
}
