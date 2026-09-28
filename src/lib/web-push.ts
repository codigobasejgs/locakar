/**
 * Inscrição deste navegador no Web Push da equipe (lado do cliente).
 * A permissão só é pedida quando a pessoa clica em "Ativar notificações" — nunca ao abrir a página.
 */
export type PushStatus =
  | "unsupported" // navegador sem Service Worker/PushManager (ex.: iPhone fora do app instalado)
  | "not-configured" // servidor sem chaves VAPID
  | "denied" // bloqueado nas configurações do navegador
  | "off" // permitido ou não perguntado, mas este navegador não está inscrito
  | "on"; // inscrito e registrado no servidor

const isSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iPhone/iPad: Web Push só existe no app instalado na tela de início (iOS 16.4+). */
export const needsInstallOnIos = () =>
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  !window.matchMedia("(display-mode: standalone)").matches;

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

function keyToBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function api(body: unknown) {
  const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Falha ao falar com o servidor.");
  return json;
}

async function publicKey(): Promise<string | null> {
  const res = await fetch("/api/push", { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { configured?: boolean; publicKey?: string | null };
  return res.ok && json.configured && json.publicKey ? json.publicKey : null;
}

export const webPushService = {
  isSupported,

  /** Estado real: permissão do navegador + inscrição existente (e com a chave VAPID atual). */
  async status(): Promise<PushStatus> {
    if (!isSupported()) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    const key = await publicKey();
    if (!key) return "not-configured";
    const sub = await (await registration()).pushManager.getSubscription();
    if (!sub || Notification.permission !== "granted") return "off";
    // Reenvia ao servidor (upsert): mantém last_seen_at e recupera inscrição apagada do banco.
    await api({ action: "register", subscription: sub.toJSON() }).catch(() => {});
    return "on";
  },

  /** Pede permissão (deve ser chamado num clique), cria a inscrição e registra no servidor. */
  async subscribe(): Promise<PushStatus> {
    if (!isSupported()) return "unsupported";
    const key = await publicKey();
    if (!key) return "not-configured";
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "off";
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // Inscrição feita com outra chave VAPID (chaves trocadas no servidor): refaz.
    const current = sub?.options.applicationServerKey;
    if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))).replace(/=+$/, "") !== btoa(String.fromCharCode(...keyToBytes(key))).replace(/=+$/, "")) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) });
    await api({ action: "register", subscription: sub.toJSON() });
    return "on";
  },

  async unsubscribe(): Promise<PushStatus> {
    if (!isSupported()) return "unsupported";
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) {
      await api({ action: "unregister", endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    return "off";
  },

  test: () => api({ action: "test" }),
};
