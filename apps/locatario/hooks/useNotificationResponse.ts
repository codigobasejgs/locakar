import * as Notifications from "expo-notifications";

export function useNotificationResponse() {
  return Notifications.useLastNotificationResponse();
}

export function clearNotificationResponse() {
  return Notifications.clearLastNotificationResponseAsync().catch(() => {});
}
