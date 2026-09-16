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
  preview_screenshot_path?: string | null;
  audio_path?: string | null;
  audio_transcript?: string | null;
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
  click_x?: number | null;
  click_y?: number | null;
  annotations_json?: string | null;
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

export interface MonitorInfo {
  id: string;
  name: string;
  is_primary: boolean;
  width: number;
  height: number;
  scale_factor: number;
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

export interface NewStepPayload {
  title: string;
  description: string;
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

export interface AiLogEvent {
  session_id: string;
  message: string;
  timestamp_ms: number;
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
  listMonitors: () => invoke<MonitorInfo[]>("list_monitors"),
  startRecording: (title?: string, monitorId?: string) =>
    invoke<Session>("start_recording", {
      title: title ?? null,
      monitor_id: monitorId ?? null,
    }),
  stopRecording: () => invoke<Session>("stop_recording"),
  pauseRecording: () => invoke<void>("pause_recording"),
  resumeRecording: () => invoke<void>("resume_recording"),
  switchRecordingMonitor: (monitorId: string) =>
    invoke<void>("switch_recording_monitor", { monitorId }),
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
  cancelDocumentation: (sessionId: string) =>
    invoke<boolean>("cancel_documentation_generation", { sessionId }),
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
  saveSessionAudio: (sessionId: string, audioBase64: string, mimeType: string) =>
    invoke<string>("save_session_audio", { sessionId, audioBase64, mimeType }),
  transcribeSessionAudio: (sessionId: string) =>
    invoke<string>("transcribe_session_audio", { sessionId }),
  deleteSession: (sessionId: string) =>
    invoke<void>("delete_session", { sessionId }),
  exportSessionBundle: (sessionId: string, targetPath: string) =>
    invoke<string>("export_session_bundle", { sessionId, targetPath }),
  importSessionBundle: (archivePath: string) =>
    invoke<Session>("import_session_bundle", { archivePath }),
  translateDocumentation: (sessionId: string, targetLanguage?: string) =>
    invoke<string>("translate_documentation", { sessionId, targetLanguage }),
  saveAnnotatedScreenshot: (
    sessionId: string,
    screenshotId: string,
    imageBase64: string,
    clickX: number | null,
    clickY: number | null,
    newStep?: { title: string; description: string },
    annotationsJson?: string | null,
  ) =>
    invoke<Screenshot>("save_annotated_screenshot", {
      sessionId,
      screenshotId,
      imageBase64,
      clickX,
      clickY,
      newStep,
      annotationsJson,
    }),
  onAiProgress: (
    sessionId: string,
    handler: (event: AiProgressEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<AiProgressEvent>("ai-progress", (event) => {
      if (event.payload.session_id === sessionId) {
        handler(event.payload);
      }
    }),
  onAiLog: (
    sessionId: string,
    handler: (event: AiLogEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<AiLogEvent>("ai-log", (event) => {
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
