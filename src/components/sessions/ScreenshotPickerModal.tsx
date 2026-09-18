import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { AppButton } from "@/components/ui/AppButton";
import type { Screenshot } from "@/lib/api";

interface ScreenshotPickerModalProps {
  currentScreenshotId?: string;
  screenshots: Screenshot[];
  stepIndex: number;
  onSelect: (screenshotId: string) => Promise<void> | void;
  onClose: () => void;
}

export function ScreenshotPickerModal({
  currentScreenshotId,
  screenshots,
  stepIndex,
  onSelect,
  onClose,
}: ScreenshotPickerModalProps) {
  const [selectedId, setSelectedId] = useState<string>(currentScreenshotId || (screenshots[0]?.id ?? ""));
  const [previewId, setPreviewId] = useState<string>(selectedId);
  const [saving, setSaving] = useState(false);

  const previewScreenshot = screenshots.find((s) => s.id === previewId);

  const handleConfirm = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await onSelect(selectedId);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(6px)",
        padding: "24px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "90vw",
          maxWidth: "1100px",
          height: "85vh",
          background: "var(--surface)",
          border: "1px solid var(--hair-2)",
          borderRadius: "14px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 22px",
            borderBottom: "1px solid var(--hair)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-2, #131b26)",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
              Scegli Screenshot per il Passo {stepIndex}
            </h3>
            <div style={{ fontSize: "12px", color: "var(--dim)", marginTop: "4px" }}>
              Seleziona un'immagine tra gli screenshot acquisiti durante la sessione.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <AppButton size="sm" kind="ghost" onClick={onClose}>
              Annulla
            </AppButton>
            <AppButton
              size="sm"
              kind="primary"
              disabled={!selectedId || saving}
              onClick={handleConfirm}
            >
              {saving ? "Aggiornamento..." : "Applica al Passo"}
            </AppButton>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left: Grid of screenshots */}
          <div
            style={{
              flex: "0 0 50%",
              borderRight: "1px solid var(--hair)",
              padding: "16px",
              overflowY: "auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: "12px",
              alignContent: "start",
            }}
          >
            {screenshots.map((s, idx) => {
              const isCurrent = s.id === currentScreenshotId;
              const isSelected = s.id === selectedId;

              return (
                <div
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    setPreviewId(s.id);
                  }}
                  onMouseEnter={() => setPreviewId(s.id)}
                  style={{
                    position: "relative",
                    borderRadius: "8px",
                    overflow: "hidden",
                    border: isSelected
                      ? "2px solid var(--mint, #38bdf8)"
                      : isCurrent
                      ? "2px solid rgba(56, 189, 248, 0.4)"
                      : "1px solid var(--hair)",
                    cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    transition: "transform 0.15s, border-color 0.15s",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ position: "relative", paddingTop: "60%", background: "#000" }}>
                    <img
                      src={convertFileSrc(s.path)}
                      alt={`Screenshot ${idx + 1}`}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      loading="lazy"
                    />
                    {isCurrent && (
                      <div
                        style={{
                          position: "absolute",
                          top: "4px",
                          left: "4px",
                          background: "rgba(14, 165, 233, 0.85)",
                          color: "#fff",
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 600,
                        }}
                      >
                        Attuale
                      </div>
                    )}
                    {isSelected && (
                      <div
                        style={{
                          position: "absolute",
                          top: "4px",
                          right: "4px",
                          background: "#38bdf8",
                          color: "#000",
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 700,
                        }}
                      >
                        ✓ Selezionato
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      padding: "6px 8px",
                      fontSize: "11px",
                      color: "var(--dim)",
                      display: "flex",
                      justifyContent: "space-between",
                      background: isSelected ? "rgba(56, 189, 248, 0.1)" : "transparent",
                    }}
                  >
                    <span>#{idx + 1}</span>
                    <span>{s.trigger || "click"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Large Preview */}
          <div
            style={{
              flex: "1",
              display: "flex",
              flexDirection: "column",
              background: "#080c14",
              padding: "16px",
              overflow: "hidden",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--dim)", marginBottom: "8px" }}>
              Anteprima Dettagliata
            </div>
            {previewScreenshot ? (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid var(--hair)",
                  background: "rgba(0,0,0,0.5)",
                }}
              >
                <img
                  src={convertFileSrc(previewScreenshot.path)}
                  alt="Preview"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                  }}
                />
              </div>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--dim)",
                }}
              >
                Nessuna immagine selezionata
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
