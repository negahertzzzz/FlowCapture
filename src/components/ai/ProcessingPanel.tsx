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
};

export function ProcessingPanel({
  activeStage,
  completedStages,
  failedStage,
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
    <div className="proc">
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
    </div>
  );
}
