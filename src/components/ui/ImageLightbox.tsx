import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  caption?: ReactNode;
  /** Optional layer drawn over the image (e.g. annotations); it is sized to the image box. */
  overlay?: ReactNode;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * Full-screen image viewer. Esc closes, ←/→ navigate when handlers are given, and a click on the
 * image toggles between "fit to screen" and actual pixel size (scrollable).
 */
export function ImageLightbox({ src, alt, caption, overlay, onClose, onPrev, onNext }: ImageLightboxProps) {
  const [actualSize, setActualSize] = useState(false);

  useEffect(() => {
    setActualSize(false);
  }, [src]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (event.key === "ArrowLeft" && onPrev) {
        onPrev();
      } else if (event.key === "ArrowRight" && onNext) {
        onNext();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, onPrev, onNext]);

  return createPortal(
    <div
      className="fc-lightbox"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="fc-lightbox-bar">
        <div className="fc-lightbox-caption">{caption ?? alt}</div>
        <div className="fc-lightbox-actions">
          {onPrev ? (
            <button type="button" onClick={onPrev} title="Precedente (←)">‹</button>
          ) : null}
          {onNext ? (
            <button type="button" onClick={onNext} title="Successivo (→)">›</button>
          ) : null}
          <button
            type="button"
            onClick={() => setActualSize((value) => !value)}
            title={actualSize ? "Adatta allo schermo" : "Dimensione reale (100%)"}
          >
            {actualSize ? "Adatta" : "100%"}
          </button>
          <button type="button" onClick={onClose} title="Chiudi (Esc)">✕</button>
        </div>
      </div>
      <div
        className={`fc-lightbox-stage${actualSize ? " actual" : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="fc-lightbox-frame">
          <img
            src={src}
            alt={alt ?? ""}
            onClick={() => setActualSize((value) => !value)}
            draggable={false}
          />
          {overlay ? <div className="fc-lightbox-overlay">{overlay}</div> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
