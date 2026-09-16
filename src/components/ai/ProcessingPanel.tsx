import { Icon } from "@/components/ui/Icon";

const STAGES = [
  { id: "timeline_builder", label: "Compressing raw events" },
  { id: "screenshot_selector", label: "Detecting workflow steps" },
  { id: "technical_writer", label: "Ranking & annotating screenshots" },
  { id: "quality_reviewer", label: "Writing documentation with Claude" },
] as const;

type ProcessingPanelProps = {
  activeStage?: string | null;
  completedStages: string[];
  failedStage?: string | null;
  logs?: string[];
  onCancel?: () => void;
};

export function ProcessingPanel({
  activeStage,
  completedStages,
  failedStage,
  logs = [],
  onCancel,
}: ProcessingPanelProps) {
  const activeIndex = STAGES.findIndex((stage) => stage.id === activeStage);
  const completedCount = completedStages.length;
  const step =
    activeIndex >= 0
      ? activeIndex
      : completedCount >= STAGES.length
        ? STAGES.length
        : completedCount;

  return (
    <div className="proc" style={{ maxWidth: "600px", margin: "0 auto" }}>
      <div className="spinner" />
      <h3>Generating documentation</h3>
      <p>FlowCapture is turning your session into clean, step-by-step docs.</p>
      <div className="steps">
        {STAGES.map((stage, index) => {
          const isDone = completedStages.includes(stage.id);
          const isActive = activeStage === stage.id;
          const isFailed = failedStage === stage.id;
          const state = isDone ? "done" : isActive ? "active" : index < step ? "done" : "";

          return (
            <div key={stage.id} className={`ps ${state}${isFailed ? " active" : ""}`}>
              <span className="pc">
                {isDone ? <Icon name="check" size={12} /> : index + 1}
              </span>
              {stage.label}
              {isFailed ? (
                <span style={{ marginLeft: "auto", color: "var(--rose)", fontSize: 12 }}>
                  Failed
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {onCancel && (
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "center" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              color: "#f87171",
              borderRadius: "8px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
            }}
          >
            <Icon name="x" size={14} />
            Annulla Generazione
          </button>
        </div>
      )}

      {logs.length > 0 && (
        <div
          style={{
            marginTop: "20px",
            width: "100%",
            textAlign: "left",
            background: "#0d1117",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "12px",
            fontFamily: "var(--mono, monospace)",
            color: "#8b949e",
            maxHeight: "180px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <div style={{ fontWeight: 600, color: "#c9d1d9", marginBottom: "4px", borderBottom: "1px solid #21262d", paddingBottom: "4px" }}>
            Real-time Pipeline Log:
          </div>
          {logs.map((log, i) => (
            <div key={i} style={{ color: log.includes("ERROR") ? "#f85149" : "#e6edf3" }}>
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
