import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ContextMenuItem = {
  label: string;
  icon?: string;
  onSelect: () => void;
  disabled?: boolean;
};

export type ContextMenuState = { x: number; y: number } | null;

interface ContextMenuProps {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

/** Small right-click menu rendered at the pointer position and kept inside the viewport. */
export function ContextMenu({ position, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState(position);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setCoords({
      x: Math.max(8, Math.min(position.x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(position.y, window.innerHeight - height - 8)),
    });
  }, [position]);

  useEffect(() => {
    function close(event: Event) {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    }
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fc-context-menu"
      role="menu"
      style={{ left: coords.x, top: coords.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.icon ? <span className="fc-context-menu-icon">{item.icon}</span> : null}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
