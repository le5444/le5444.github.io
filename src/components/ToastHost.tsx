import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import { subscribeToasts, dismissToast, type Toast } from "../utils/toast";

const ICON_MAP = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
} as const;

const BORDER_MAP = {
  info: "border-slate-700 bg-slate-900/95 text-slate-100",
  success: "border-emerald-700/60 bg-emerald-900/95 text-emerald-50",
  warning: "border-amber-700/60 bg-amber-900/95 text-amber-50",
  error: "border-rose-700/60 bg-rose-900/95 text-rose-50",
} as const;

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICON_MAP[t.kind];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex min-w-[260px] max-w-[420px] items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-xl backdrop-blur ${BORDER_MAP[t.kind]}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1 whitespace-pre-line break-words">{t.text}</div>
            <button
              onClick={() => dismissToast(t.id)}
              className="-mr-1 shrink-0 rounded p-0.5 text-current opacity-60 hover:opacity-100"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
