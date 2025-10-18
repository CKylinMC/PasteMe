export class TauriUnavailableError extends Error {
  command?: string;

  constructor(command?: string) {
    const suffix = command ? `：${command}` : "";
    super(`Tauri 运行时不可用${suffix}`);
    this.name = "TauriUnavailableError";
    this.command = command;
  }
}

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const internals = (window as any).__TAURI_INTERNALS__;
  return !!internals && typeof internals.invoke === "function";
}

export async function safeInvoke<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new TauriUnavailableError(command);
  }
  const internals = (window as any).__TAURI_INTERNALS__;
  return internals.invoke(command, args) as Promise<T>;
}

export function explainTauriFallback(): string {
  return "当前运行在浏览器预览模式，部分需要桌面端支持的能力已自动跳过。";
}
