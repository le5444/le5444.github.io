// 轻量 toast：module-level queue + 订阅式 React 组件挂在 App 根部
// 调用方只需 import { showToast } from "../utils/toast"

export type ToastKind = "info" | "success" | "warning" | "error";
export interface Toast {
  id: string;
  kind: ToastKind;
  text: string;
}

type Listener = (toasts: Toast[]) => void;

let queue: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l(queue));
}

export function showToast(text: string, kind: ToastKind = "info", durationMs = 3500) {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  queue = [...queue, { id, kind, text }];
  emit();
  if (durationMs > 0) {
    setTimeout(() => {
      queue = queue.filter((t) => t.id !== id);
      emit();
    }, durationMs);
  }
  return id;
}

export function dismissToast(id: string) {
  queue = queue.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(cb: Listener) {
  listeners.add(cb);
  cb(queue);
  return () => {
    listeners.delete(cb);
  };
}
