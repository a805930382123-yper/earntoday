type InvokeArgs = Record<string, unknown> | undefined;

// Vite 里的 ESM 入口偶尔早于 WebView 注入层初始化；
// 这里优先使用 Tauri 全局桥接，保证设置窗冷启动时 invoke 可用。
export async function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  const bridge = (window as unknown as Record<string, any>).__TAURI_INTERNALS__?.invoke
    ?? (window as unknown as Record<string, any>).__TAURI__?.core?.invoke;

  if (typeof bridge !== "function") {
    throw new Error("Tauri bridge is not ready");
  }

  return bridge(cmd, args) as Promise<T>;
}
