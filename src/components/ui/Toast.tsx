import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";

type ToastProps = {
  message: string | null;
  onDismiss?: () => void;
};

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message || !onDismiss) return;
    const timeout = window.setTimeout(onDismiss, 1800);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        background: "var(--elevated)",
        border: "1px solid var(--mint-30)",
        color: "var(--text)",
        padding: "12px 20px",
        borderRadius: 12,
        fontSize: 14,
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        gap: 9,
        alignItems: "center",
        animation: "fcfade .2s ease",
      }}
    >
      <Icon name="check" size={16} style={{ color: "var(--mint)" }} />
      {message}
    </div>
  );
}
