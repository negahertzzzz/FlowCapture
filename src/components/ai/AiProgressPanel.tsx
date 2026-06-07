import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const STAGES = [
  { id: "timeline_builder", label: "Timeline Builder" },
  { id: "screenshot_selector", label: "Screenshot Selector" },
  { id: "technical_writer", label: "Technical Writer" },
  { id: "quality_reviewer", label: "Quality Reviewer" },
] as const;

interface AiProgressPanelProps {
  activeStage?: string | null;
  completedStages: string[];
  failedStage?: string | null;
}

export function AiProgressPanel({
  activeStage,
  completedStages,
  failedStage,
}: AiProgressPanelProps) {
  const completedCount = completedStages.length;
  const progress = (completedCount / STAGES.length) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Processing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progress} />
        <div className="space-y-2">
          {STAGES.map((stage) => {
            const isCompleted = completedStages.includes(stage.id);
            const isActive = activeStage === stage.id;
            const isFailed = failedStage === stage.id;

            return (
              <div
                key={stage.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  isActive && "bg-[var(--color-accent)]",
                  isFailed && "bg-[rgba(248,113,113,0.08)]",
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 text-[var(--color-primary)]" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />
                ) : (
                  <Circle className="h-4 w-4 text-[var(--color-muted-foreground)]" />
                )}
                <span>{stage.label}</span>
                {isFailed ? (
                  <span className="ml-auto text-xs text-[var(--color-destructive)]">Failed</span>
                ) : null}
                {isCompleted ? (
                  <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">Done</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
