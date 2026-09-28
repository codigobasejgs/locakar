import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Cache local para abrir o app sem internet (última versão recebida do servidor) e rascunhos (vistoria).
 * Só dados do próprio cliente; apagado no logout. Nunca guarda token (esse fica no SecureStore).
 */
const PREFIX = "locakar:";

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* cache é conveniência: falhar não pode derrubar a tela */
  }
}

export async function removeCache(key: string) {
  await AsyncStorage.removeItem(PREFIX + key).catch(() => {});
}

export async function clearCache() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX) && k !== `${PREFIX}installation`);
    await AsyncStorage.multiRemove(keys);
  } catch {
    /* idem */
  }
}

/** Id desta instalação do app (não identifica a pessoa; some ao desinstalar). */
export async function installationId(newId: () => string) {
  const key = `${PREFIX}installation`;
  const found = await AsyncStorage.getItem(key).catch(() => null);
  if (found) return found;
  const id = newId();
  await AsyncStorage.setItem(key, id).catch(() => {});
  return id;
}
