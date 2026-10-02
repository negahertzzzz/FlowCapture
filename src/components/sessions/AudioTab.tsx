import { convertFileSrc } from "@tauri-apps/api/core";
import { useMemo, useRef, useState } from "react";
import { AppButton } from "@/components/ui/AppButton";
import { Icon } from "@/components/ui/Icon";
import type { AudioSegment, Session } from "@/lib/api";

export type AudioTranscriptionStatus = "idle" | "transcribing" | "success" | "error";

interface AudioTabProps {
  session: Session;
  busy: boolean;
  transcribing: boolean;
  onTranscribe: () => void;
  showLog: boolean;
  onCloseLog: () => void;
  status: AudioTranscriptionStatus;
  logs: string[];
}

/** "Audio" tab of a session: microphone track, transcription log and timed transcript. */
export function AudioTab({
  session,
  busy,
  transcribing,
  onTranscribe,
  showLog,
  onCloseLog,
  status,
  logs,
}: AudioTabProps) {
  const [audioViewMode, setAudioViewMode] = useState<"segments" | "text">("segments");
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const audioSegments: AudioSegment[] = useMemo(() => {
    if (!session.audio_segments_json) return [];
    try {
      const parsed = JSON.parse(session.audio_segments_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [session.audio_segments_json]);

  return (
    <div className="card panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h3>Registrazione Audio & Trascrizione Vocale</h3>
          <div className="pd">Riascolta l'audio del microfono catturato e visualizza la trascrizione AI del parlato.</div>
        </div>
        {session.audio_path ? (
          <AppButton
            kind="primary"
            icon="sparkles"
            size="sm"
            disabled={transcribing || busy}
            onClick={onTranscribe}
          >
            {transcribing ? "Trascrizione in corso…" : session.audio_transcript ? "Ritrascrivi Audio" : "Trascrivi con AI"}
          </AppButton>
        ) : null}
      </div>

      {showLog && (
        <div
          style={{
            marginTop: "12px",
            marginBottom: "16px",
            background: "#0d1117",
            border: `1px solid ${
              status === "error"
                ? "rgba(239, 68, 68, 0.45)"
                : status === "success"
                ? "rgba(52, 211, 153, 0.45)"
                : "rgba(108, 198, 255, 0.4)"
            }`,
            borderRadius: "10px",
            padding: "14px 16px",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: 600,
                fontSize: "13px",
                color:
                  status === "error"
                    ? "#f87171"
                    : status === "success"
                    ? "#34d399"
                    : "var(--ice)",
              }}
            >
              {status === "transcribing" && (
                <span
                  style={{
                    display: "inline-block",
                    width: "12px",
                    height: "12px",
                    border: "2px solid var(--ice)",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              )}
              {status === "success" && <Icon name="check" size={15} />}
              {status === "error" && <Icon name="alert" size={15} />}
              <span>
                {status === "transcribing"
                  ? "Trascrizione audio in corso con servizio AI..."
                  : status === "success"
                  ? "Trascrizione vocale completata!"
                  : "Errore durante la trascrizione vocale"}
              </span>
            </div>
            <button
              type="button"
              onClick={onCloseLog}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "none",
                borderRadius: "6px",
                color: "#8b949e",
                cursor: "pointer",
                padding: "3px 8px",
                fontSize: "11px",
              }}
            >
              Chiudi log ✕
            </button>
          </div>

          <div
            style={{
              fontFamily: "var(--mono, monospace)",
              fontSize: "12px",
              lineHeight: "1.5",
              color: "#c9d1d9",
              maxHeight: "160px",
              overflowY: "auto",
              background: "rgba(0, 0, 0, 0.4)",
              borderRadius: "6px",
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {logs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  color: log.includes("ERRORE")
                    ? "#f87171"
                    : log.includes("successo")
                    ? "#34d399"
                    : "#e6edf3",
                }}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {session.audio_path ? (
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--hair)" }}>
            <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "8px", color: "var(--text)" }}>
              Traccia Audio Microfono:
            </div>
            <audio
              ref={audioPlayerRef}
              controls
              src={convertFileSrc(session.audio_path)}
              style={{ width: "100%", height: "40px" }}
            />
          </div>

          <div style={{ padding: "16px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--hair)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>
                  Trascrizione del Parlato (Speech-to-Text):
                </div>
                {session.audio_transcript ? (
                  <span style={{ fontSize: "11px", color: "#34d399", fontWeight: 600, background: "rgba(52, 211, 153, 0.15)", padding: "2px 8px", borderRadius: "10px" }}>
                    ● Trascritto
                  </span>
                ) : null}
                {audioSegments.length > 0 ? (
                  <span style={{ fontSize: "11px", color: "var(--ice)", fontWeight: 600, background: "rgba(108, 198, 255, 0.15)", padding: "2px 8px", borderRadius: "10px" }}>
                    {audioSegments.length} segmenti temporizzati
                  </span>
                ) : null}
              </div>

              {session.audio_transcript && audioSegments.length > 0 && (
                <div style={{ display: "flex", background: "rgba(255, 255, 255, 0.05)", borderRadius: "6px", padding: "2px", border: "1px solid var(--hair)" }}>
                  <button
                    type="button"
                    onClick={() => setAudioViewMode("segments")}
                    style={{
                      background: audioViewMode === "segments" ? "var(--mint)" : "transparent",
                      color: audioViewMode === "segments" ? "var(--mint-ink)" : "var(--dim)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      cursor: "pointer",
                      fontWeight: audioViewMode === "segments" ? 600 : 400,
                      transition: "all 0.15s",
                    }}
                  >
                    Segmenti ({audioSegments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAudioViewMode("text")}
                    style={{
                      background: audioViewMode === "text" ? "var(--mint)" : "transparent",
                      color: audioViewMode === "text" ? "var(--mint-ink)" : "var(--dim)",
                      border: "none",
                      borderRadius: "4px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      cursor: "pointer",
                      fontWeight: audioViewMode === "text" ? 600 : 400,
                      transition: "all 0.15s",
                    }}
                  >
                    Testo Continuo
                  </button>
                </div>
              )}
            </div>

            {session.audio_transcript ? (
              audioViewMode === "segments" && audioSegments.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "480px", overflowY: "auto", paddingRight: "4px" }}>
                  {audioSegments.map((seg, idx) => {
                    const startSec = Math.floor(seg.start_ms / 1000);
                    const endSec = Math.floor(seg.end_ms / 1000);
                    const fmtTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "12px",
                          padding: "10px 14px",
                          borderRadius: "6px",
                          background: "var(--surface)",
                          border: "1px solid var(--hair)",
                          transition: "background 0.15s",
                        }}
                      >
                        <button
                          type="button"
                          title="Ascolta questo segmento"
                          onClick={() => {
                            if (audioPlayerRef.current) {
                              audioPlayerRef.current.currentTime = seg.start_ms / 1000;
                              audioPlayerRef.current.play();
                            }
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                            background: "rgba(108, 198, 255, 0.12)",
                            border: "1px solid rgba(108, 198, 255, 0.3)",
                            borderRadius: "4px",
                            padding: "3px 8px",
                            color: "var(--ice)",
                            fontSize: "11px",
                            fontFamily: "monospace",
                            cursor: "pointer",
                            flexShrink: 0,
                            marginTop: "1px",
                          }}
                        >
                          <span>▶</span>
                          <span>{fmtTime(startSec)} - {fmtTime(endSec)}</span>
                        </button>
                        <div style={{ flex: 1, fontSize: "13.5px", lineHeight: "1.5", color: "var(--text)" }}>
                          {seg.text}
                        </div>
                        {typeof seg.avg_logprob === "number" && seg.avg_logprob !== 0 && (
                          <span
                            title={`Whisper logprob: ${seg.avg_logprob.toFixed(2)}`}
                            style={{
                              fontSize: "10px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: seg.avg_logprob > -0.6 ? "rgba(52, 211, 153, 0.1)" : "rgba(251, 191, 36, 0.1)",
                              color: seg.avg_logprob > -0.6 ? "#34d399" : "#fbbf24",
                              fontFamily: "monospace",
                              flexShrink: 0,
                            }}
                          >
                            {Math.round(Math.min(100, Math.max(0, Math.exp(seg.avg_logprob) * 100)))}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>
                  {audioSegments.length === 0 && (
                    <div
                      style={{
                        marginBottom: "12px",
                        padding: "10px 14px",
                        background: "rgba(234, 179, 8, 0.08)",
                        border: "1px solid rgba(234, 179, 8, 0.3)",
                        borderRadius: "6px",
                        fontSize: "12.5px",
                        color: "#fbbf24",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span>💡</span>
                      <span>
                        Questa sessione contiene una trascrizione solo testuale senza segmenti temporizzati.
                        Clicca sul pulsante <strong>"Ritrascrivi Audio"</strong> in alto a destra per estrarre la segmentazione con il server Whisper aggiornato.
                      </span>
                    </div>
                  )}
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: "14px",
                      lineHeight: "1.6",
                      color: "var(--text)",
                      background: "var(--surface)",
                      padding: "14px 16px",
                      borderRadius: "6px",
                      border: "1px solid var(--hair)",
                    }}
                  >
                    {session.audio_transcript}
                  </div>
                </div>
              )
            ) : (
              <div style={{ color: "var(--dim)", fontSize: "13.5px" }}>
                Nessuna trascrizione generata finora. Clicca sul pulsante in alto a destra "Trascrivi con AI" per convertire la voce in testo.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="pd" style={{ marginTop: "16px" }}>
          Nessun audio del microfono registrato per questa sessione. Per registrare l'audio, attiva l'opzione "Registra audio microfono" prima di avviare la registrazione.
        </div>
      )}
    </div>
  );
}
