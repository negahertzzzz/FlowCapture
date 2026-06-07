import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface Session {
  id: string;
  title: string;
  status: string;
  started_at: string;
  ended_at?: string | null;
  video_path?: string | null;
  duration: number;
  documentation_md?: string | null;
  steps_json?: string | null;
  compressed_events_json?: string | null;
}

export interface StoredEvent {
  id: string;
  session_id: string;
  event_type: string;
  app_name?: string | null;
  payload: string;
  created_at: string;
  timestamp_ms: number;
}

export interface SessionEvent {
  event_type: string;
  app_name?: string | null;
  payload: Record<string, unknown>;
  timestamp_ms: number;
}

export interface Screenshot {
  id: string;
  session_id: string;
  path: string;
  timestamp_ms: number;
  trigger?: string | null;
  selected: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  provider_type: string;
  api_key?: string | null;
  base_url?: string | null;
  model?: string | null;
  enabled: number;
  created_at: string;
}

export interface ExportRecord {
  id: string;
  session_id: string;
  format: string;
  path: string;
  created_at: string;
}

export interface AiJob {
  id: string;
  session_id: string;
  stage: string;
  status: string;
  input_json?: string | null;
  output_json?: string | null;
  error?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  timestamp_ms: number;
  screenshot_ids: string[];
}

export interface RedactionSummary {
  count: number;
  patterns: string[];
}

export interface VideoReadyEvent {
  sessionId: string;
  videoPath: string;
}

export interface AiProgressEvent {
  session_id: string;
  stage: string;
  status: string;
}

export interface GenerateDocumentationResult {
  markdown: string;
  redaction_summary: RedactionSummary;
}

export interface ExportOptionsPayload {
  theme: string;
  accent: string;
  pageSize: string;
  cover: boolean;
  screenshots: boolean;
  stepNumbers: boolean;
  timestamps: boolean;
  annotations: boolean;
  branding: boolean;
}

export interface RecordingPermissions {
  screen_recording_granted: boolean;
  accessibility_granted: boolean;
  input_monitoring_granted: boolean;
  can_record: boolean;
  process_name: string;
  executable_path: string;
  is_dev_mode: boolean;
  settings_app_names: string[];
  message: string;
  help_steps: string[];
}

export const api = {
  getRecordingPermissions: () =>
    invoke<RecordingPermissions>("get_recording_permissions"),
  prepareRecordingPermissions: () =>
    invoke<RecordingPermissions>("prepare_recording_permissions"),
  requestAccessibilityPermission: () =>
    invoke<boolean>("request_accessibility_permission"),
  openScreenRecordingSettings: () =>
    invoke<void>("open_screen_recording_settings"),
  openAccessibilitySettings: () => invoke<void>("open_accessibility_settings"),
  revealExecutableInFinder: () => invoke<void>("reveal_executable_in_finder"),
  getPlatformName: () => invoke<string>("get_platform_name"),
  listSessions: () => invoke<Session[]>("list_sessions"),
  getSession: (sessionId: string) =>
    invoke<Session | null>("get_session", { sessionId }),
  updateSessionTitle: (sessionId: string, title: string) =>
    invoke<void>("update_session_title", { sessionId, title }),
  updateSessionDocumentation: (sessionId: string, markdown: string) =>
    invoke<void>("update_session_documentation", { sessionId, markdown }),
  startRecording: (title?: string) =>
    invoke<Session>("start_recording", { title }),
  stopRecording: () => invoke<Session>("stop_recording"),
  captureManualScreenshot: () => invoke<void>("capture_manual_screenshot"),
  listEvents: (sessionId: string) =>
    invoke<StoredEvent[]>("list_events", { sessionId }),
  listScreenshots: (sessionId: string) =>
    invoke<Screenshot[]>("list_screenshots", { sessionId }),
  deleteScreenshot: (screenshotId: string) =>
    invoke<void>("delete_screenshot", { screenshotId }),
  listProviders: () => invoke<ProviderConfig[]>("list_providers"),
  updateProvider: (provider: ProviderConfig) =>
    invoke<void>("update_provider", { provider }),
  generateDocumentation: (sessionId: string) =>
    invoke<GenerateDocumentationResult>("generate_documentation", { sessionId }),
  listAiJobs: (sessionId: string) =>
    invoke<AiJob[]>("list_ai_jobs", { sessionId }),
  exportSession: (
    sessionId: string,
    format: string,
    options?: ExportOptionsPayload,
  ) => invoke<ExportRecord>("export_session", { sessionId, format, options }),
  listExports: (sessionId: string) =>
    invoke<ExportRecord[]>("list_exports", { sessionId }),
  getCompressedTimeline: (sessionId: string) =>
    invoke<SessionEvent[]>("get_compressed_timeline", { sessionId }),
  getReplaySteps: (sessionId: string) =>
    invoke<WorkflowStep[]>("get_replay_steps", { sessionId }),
  getSetting: (key: string) => invoke<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) =>
    invoke<void>("set_setting", { key, value }),
  onAiProgress: (
    sessionId: string,
    handler: (event: AiProgressEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<AiProgressEvent>("ai-progress", (event) => {
      if (event.payload.session_id === sessionId) {
        handler(event.payload);
      }
    }),
  onVideoReady: (
    sessionId: string,
    handler: (event: VideoReadyEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<VideoReadyEvent>("video-ready", (event) => {
      if (event.payload.sessionId === sessionId) {
        handler(event.payload);
      }
    }),
};
