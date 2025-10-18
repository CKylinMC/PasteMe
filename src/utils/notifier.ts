export type NotificationKind = "success" | "error" | "warning" | "info";

export interface AppNotification {
  type: NotificationKind;
  message: string;
  duration?: number;
}

export function notify(kind: NotificationKind, message: string, duration?: number) {
  const event = new CustomEvent<AppNotification>("vibeclip:notify", {
    detail: { type: kind, message, duration },
  });
  window.dispatchEvent(event);
}

export function notifyError(message: string, duration?: number) {
  notify("error", message, duration);
}

export function notifyWarning(message: string, duration?: number) {
  notify("warning", message, duration);
}

export function notifySuccess(message: string, duration?: number) {
  notify("success", message, duration);
}

export function notifyInfo(message: string, duration?: number) {
  notify("info", message, duration);
}
