import { useEffect, useState } from "react";
import { AppButton } from "@/components/ui/AppButton";
import { api, type ProviderConfig, type MonitorInfo } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { providerGlyph } from "@/lib/icons";
import { useLanguage } from "@/i18n";

export function SettingsPage() {
  const { t, language, setLanguage } = useLanguage();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [redactionEnabled, setRedactionEnabled] = useState(true);
  const [recordAudio, setRecordAudio] = useState(false);
  const [transcribeAudio, setTranscribeAudio] = useState(true);
  const [highlightClicks, setHighlightClicks] = useState(true);
  const [selectedMonitorId, setSelectedMonitorId] = useState("");
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState("");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [captureAllEvents, setCaptureAllEvents] = useState(false);
  const [transcriptionProviderId, setTranscriptionProviderId] = useState("");
  const [transcriptionModel, setTranscriptionModel] = useState("");
  const [transcriptionBaseUrl, setTranscriptionBaseUrl] = useState("");
  const [transcriptionLanguage, setTranscriptionLanguage] = useState("it");
  const [aiThinkingMode, setAiThinkingMode] = useState("auto");
  const [aiCustomParams, setAiCustomParams] = useState("{\n  \"temperature\": 0.2\n}");
  const [customParamsError, setCustomParamsError] = useState<string | null>(null);
  const [recordFullVideo, setRecordFullVideo] = useState(true);
  const [fullVideoFps, setFullVideoFps] = useState("30");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bridgeInfo, setBridgeInfo] = useState<{ port: number; recording: boolean } | null>(null);

  async function refreshDevices() {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter((d) => d.kind === "audioinput"));
    } catch {
      // ignore
    }
  }

  async function refreshMonitors() {
    try {
      const list = await api.listMonitors();
      setMonitors(list);
    } catch {
      // ignore
    }
  }

  async function refresh() {
    const [
      nextProviders,
      nextSetting,
      nextRecordAudio,
      nextTranscribe,
      nextHighlight,
      nextMicId,
      nextMonitorId,
      nextCaptureAll,
      nextTransProvId,
      nextTransModel,
      nextTransUrl,
      nextTransLang,
      nextThinkingMode,
      nextCustomParams,
      nextMonitors,
      nextRecordFullVideo,
      nextFullVideoFps,
    ] = await Promise.all([
      api.listProviders(),
      api.getSetting("redaction_enabled"),
      api.getSetting("record_audio"),
      api.getSetting("transcribe_audio"),
      api.getSetting("highlight_clicks"),
      api.getSetting("selected_microphone_id"),
      api.getSetting("selected_monitor_id"),
      api.getSetting("capture_all_events"),
      api.getSetting("transcription_provider_id"),
      api.getSetting("transcription_model"),
      api.getSetting("transcription_base_url"),
      api.getSetting("transcription_language"),
      api.getSetting("ai_thinking_mode"),
      api.getSetting("ai_custom_parameters"),
      api.listMonitors().catch(() => [] as MonitorInfo[]),
      api.getSetting("record_full_video"),
      api.getSetting("full_video_fps"),
    ]);
    setProviders(nextProviders);
    setRedactionEnabled((nextSetting ?? "true") === "true");
    setRecordAudio(nextRecordAudio === "true");
    setTranscribeAudio((nextTranscribe ?? "true") === "true");
    setHighlightClicks((nextHighlight ?? "true") === "true");
    setCaptureAllEvents(nextCaptureAll === "true");
    setTranscriptionProviderId(nextTransProvId ?? "");
    setTranscriptionModel(nextTransModel ?? "");
    setTranscriptionBaseUrl(nextTransUrl ?? "");
    setTranscriptionLanguage(nextTransLang ?? "it");
    setAiThinkingMode(nextThinkingMode ?? "auto");
    setRecordFullVideo((nextRecordFullVideo ?? "true") !== "false");
    setFullVideoFps(nextFullVideoFps || "30");
    if (nextCustomParams) {
      setAiCustomParams(nextCustomParams);
    }
    if (nextMicId) setSelectedMicId(nextMicId);
    if (nextMonitorId) setSelectedMonitorId(nextMonitorId);
    setMonitors(nextMonitors);
    api.getBrowserBridgeStatus().then(setBridgeInfo).catch(() => {});
    await refreshDevices();
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
  }, []);

  async function saveProvider(provider: ProviderConfig) {
    setMessage(null);
    setError(null);
    try {
      await api.updateProvider(provider);
      setMessage(`${provider.name} saved`);
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleSaveCustomParams(jsonStr: string) {
    const trimmed = jsonStr.trim();
    if (!trimmed) {
      setCustomParamsError(null);
      setAiCustomParams("{}");
      await api.setSetting("ai_custom_parameters", "{}");
      setMessage(t("settings.custom_params.saved_empty", "Custom parameters saved ({})"));
      return;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setCustomParamsError(t("settings.custom_params.err_obj", "Parameters must be a valid JSON object"));
        return;
      }
      setCustomParamsError(null);
      const formatted = JSON.stringify(parsed, null, 2);
      setAiCustomParams(formatted);
      await api.setSetting("ai_custom_parameters", formatted);
      setMessage(t("settings.custom_params.saved_success", "Custom parameters saved successfully"));
    } catch (e: any) {
      setCustomParamsError(`Errore sintassi JSON: ${e?.message ?? e}`);
    }
  }

  function applyPreset(presetObj: Record<string, any>) {
    const formatted = JSON.stringify(presetObj, null, 2);
    setAiCustomParams(formatted);
    setCustomParamsError(null);
    api.setSetting("ai_custom_parameters", formatted).then(() => {
      setMessage(t("settings.custom_params.preset_applied", "Custom parameters preset applied"));
    });
  }

  const activeProvider = providers.find((provider) => provider.enabled);

  return (
    <div className="page">
      <div className="home-hero">
        <h1 style={{ fontSize: 34 }}>Settings</h1>
        <p className="lead">Configure BYOK AI providers and privacy controls.</p>
      </div>

      {message ? (
        <div
          className="banner"
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span className="bt">{message}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              padding: "2px 6px",
              fontSize: "13px",
              opacity: 0.7,
            }}
          >
            ✕
          </button>
        </div>
      ) : null}
      {error ? (
        <div
          className="card set-card"
          style={{
            marginTop: 18,
            borderColor: "rgba(255,138,138,.45)",
            background: "rgba(255,100,100,0.06)",
            color: "var(--rose)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="alert" size={18} />
            <span style={{ fontSize: "13px", lineHeight: "1.4" }}>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "none",
              borderRadius: "6px",
              color: "var(--rose)",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: "13px",
              fontWeight: "bold",
              flexShrink: 0,
            }}
            title="Chiudi messaggio di errore"
          >
            ✕
          </button>
        </div>
      ) : null}

            <div className="card set-card">
        <h3>{t("settings.language.title")}</h3>
        <div className="sub">{t("settings.language.sub")}</div>
        <div className="field" style={{ maxWidth: 420 }}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as any)}
            style={{
              width: "100%",
              background: "var(--bg-3, #151b23)",
              color: "var(--text-1)",
              border: "1px solid var(--border)",
              padding: "8px 12px",
              borderRadius: "6px",
              fontSize: "13px",
            }}
          >
            <option value="en">English (US)</option>
            <option value="it">Italiano (IT)</option>
          </select>
        </div>
      </div>

<div className="card set-card">
        <h3>{t("settings.privacy.title")}</h3>
        <div className="sub">{t("settings.privacy.sub")}</div>
        <div
          className="field"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 420,
          }}
        >
          <label style={{ margin: 0 }}>{t("settings.redaction.label")}</label>
          <div className="seg">
            <button
              type="button"
              className={redactionEnabled ? "on" : ""}
              onClick={async () => {
                setRedactionEnabled(true);
                await api.setSetting("redaction_enabled", "true");
              }}
            >{t("settings.enabled")}</button>
            <button
              type="button"
              className={!redactionEnabled ? "on" : ""}
              onClick={async () => {
                setRedactionEnabled(false);
                await api.setSetting("redaction_enabled", "false");
              }}
            >{t("settings.disabled")}</button>
          </div>
        </div>
      </div>

      <div className="card set-card">
        <h3>{t("settings.diagnostics.title")}</h3>
        <div className="sub">{t("settings.diagnostics.sub")}</div>
        <div style={{ marginTop: 14 }}>
          <AppButton
            kind="ghost"
            onClick={async () => {
              try {
                const path = await api.openLogsFolder();
                setMessage(`Logs folder opened: ${path}`);
              } catch (e: any) {
                setError(`Could not open logs folder: ${e?.message ?? e}`);
              }
            }}
          >
            {t("settings.open_logs")}
          </AppButton>
        </div>
      </div>

      <div className="card set-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <h3>{t("settings.extension.title")}</h3>
            <div className="sub">{t("settings.extension.sub")}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", background: "rgba(34, 197, 94, 0.1)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.25)", padding: "4px 10px", borderRadius: "16px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }}></span>
            {t("settings.bridge_active")} (127.0.0.1:{bridgeInfo?.port ?? 41789})
          </div>
        </div>

        <div style={{ marginTop: 14, padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid var(--hair)", fontSize: "12px", color: "var(--text)", lineHeight: "1.6" }}>
          <div style={{ fontWeight: 600, color: "#38bdf8", marginBottom: 6 }}>{t("settings.extension.install_title")}</div>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            <li>{t("settings.extension.step1")}</li>
            <li>{t("settings.extension.step2")}</li>
            <li>{t("settings.extension.step3")}</li>
          </ol>
          <div style={{ marginTop: 8, color: "var(--dim)" }}>
            {t("settings.extension.note")}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <AppButton
            kind="primary"
            onClick={async () => {
              try {
                const path = await api.openBrowserExtensionFolder();
                setMessage(`Extension folder opened: ${path}`);
              } catch (e: any) {
                setError(`Could not open extension folder: ${e?.message ?? e}`);
              }
            }}
          >
            {t("settings.open_extension")}
          </AppButton>
        </div>
      </div>

      <div className="card set-card">
        <h3>{t("settings.recording.title")}</h3>
        <div className="sub">{t("settings.recording.sub")}</div>

        <div
          className="field"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 520,
            marginTop: 14,
          }}
        >
          <div>
            <label style={{ margin: 0 }}>{t("settings.highlight.label")}</label>
            <div style={{ fontSize: "12px", color: "var(--dim)" }}>{t("settings.highlight.sub")}</div>
          </div>
          <div className="seg">
            <button
              type="button"
              className={highlightClicks ? "on" : ""}
              onClick={async () => {
                setHighlightClicks(true);
                await api.setSetting("highlight_clicks", "true");
              }}
            >{t("settings.active")}</button>
            <button
              type="button"
              className={!highlightClicks ? "on" : ""}
              onClick={async () => {
                setHighlightClicks(false);
                await api.setSetting("highlight_clicks", "false");
              }}
            >{t("settings.inactive")}</button>
          </div>
        </div>

        <div
          className="field"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 520,
            marginTop: 14,
          }}
        >
          <div>
            <label style={{ margin: 0 }}>{t("settings.video.label")}</label>
            <div style={{ fontSize: "12px", color: "var(--dim)" }}>{t("settings.video.sub")}</div>
          </div>
          <div className="seg">
            <button
              type="button"
              className={recordFullVideo ? "on" : ""}
              onClick={async () => {
                setRecordFullVideo(true);
                await api.setSetting("record_full_video", "true");
              }}
            >{t("settings.active")}</button>
            <button
              type="button"
              className={!recordFullVideo ? "on" : ""}
              onClick={async () => {
                setRecordFullVideo(false);
                await api.setSetting("record_full_video", "false");
              }}
            >{t("settings.inactive")}</button>
          </div>
        </div>

        {recordFullVideo && (
          <div
            className="field"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              maxWidth: 520,
              marginTop: 14,
            }}
          >
            <div>
              <label style={{ margin: 0 }}>{t("settings.fps.label")}</label>
              <div style={{ fontSize: "12px", color: "var(--dim)" }}>{t("settings.fps.sub")}</div>
            </div>
            <div className="seg">
              <button
                type="button"
                className={fullVideoFps === "15" ? "on" : ""}
                onClick={async () => {
                  setFullVideoFps("15");
                  await api.setSetting("full_video_fps", "15");
                }}
              >
                15 FPS
              </button>
              <button
                type="button"
                className={fullVideoFps === "30" ? "on" : ""}
                onClick={async () => {
                  setFullVideoFps("30");
                  await api.setSetting("full_video_fps", "30");
                }}
              >
                30 FPS
              </button>
              <button
                type="button"
                className={fullVideoFps === "60" ? "on" : ""}
                onClick={async () => {
                  setFullVideoFps("60");
                  await api.setSetting("full_video_fps", "60");
                }}
              >
                60 FPS
              </button>
            </div>
          </div>
        )}

        <div
          className="field"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 520,
            marginTop: 14,
          }}
        >
          <div>
            <label style={{ margin: 0 }}>{t("settings.mic.label")}</label>
            <div style={{ fontSize: "12px", color: "var(--dim)" }}>{t("settings.mic.sub")}</div>
          </div>
          <div className="seg">
            <button
              type="button"
              className={recordAudio ? "on" : ""}
              onClick={async () => {
                setRecordAudio(true);
                await api.setSetting("record_audio", "true");
              }}
            >{t("settings.active")}</button>
            <button
              type="button"
              className={!recordAudio ? "on" : ""}
              onClick={async () => {
                setRecordAudio(false);
                await api.setSetting("record_audio", "false");
              }}
            >{t("settings.inactive")}</button>
          </div>
        </div>

        <div
          className="field"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 520,
            marginTop: 14,
          }}
        >
          <div>
            <label style={{ margin: 0 }}>{t("settings.transcription.label")}</label>
            <div style={{ fontSize: "12px", color: "var(--dim)" }}>{t("settings.transcription.sub")}</div>
          </div>
          <div className="seg">
            <button
              type="button"
              className={transcribeAudio ? "on" : ""}
              onClick={async () => {
                setTranscribeAudio(true);
                await api.setSetting("transcribe_audio", "true");
              }}
            >{t("settings.active")}</button>
            <button
              type="button"
              className={!transcribeAudio ? "on" : ""}
              onClick={async () => {
                setTranscribeAudio(false);
                await api.setSetting("transcribe_audio", "false");
              }}
            >{t("settings.inactive")}</button>
          </div>
        </div>

        {transcribeAudio && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--hair)",
              borderRadius: "6px",
              maxWidth: 520,
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text)", fontWeight: 500 }}>
              Configurazione Motore di Trascrizione
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "12px", minWidth: "140px", color: "var(--dim)", margin: 0 }}>{t("settings.transcription_provider")}</label>
              <select
                value={transcriptionProviderId}
                onChange={async (e) => {
                  const val = e.target.value;
                  setTranscriptionProviderId(val);
                  await api.setSetting("transcription_provider_id", val);
                }}
                style={{
                  flex: 1,
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--hair)",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  fontSize: "12.5px",
                }}
              >
                <option value="">Usa Provider Attivo Globale</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.provider_type})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "12px", minWidth: "140px", color: "var(--dim)", margin: 0 }}>{t("settings.transcription_model")}</label>
              <input
                type="text"
                placeholder="es. whisper-1, gemini-2.5-flash, whisper, faster-whisper"
                value={transcriptionModel}
                onChange={(e) => setTranscriptionModel(e.target.value)}
                onBlur={async (e) => {
                  await api.setSetting("transcription_model", e.target.value);
                }}
                style={{
                  flex: 1,
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--hair)",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  fontSize: "12.5px",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "12px", minWidth: "140px", color: "var(--dim)", margin: 0 }}>{t("settings.transcription_url")}</label>
              <input
                type="text"
                placeholder="es. http://localhost:11434 o http://localhost:8000"
                value={transcriptionBaseUrl}
                onChange={(e) => setTranscriptionBaseUrl(e.target.value)}
                onBlur={async (e) => {
                  await api.setSetting("transcription_base_url", e.target.value);
                }}
                style={{
                  flex: 1,
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--hair)",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  fontSize: "12.5px",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "12px", minWidth: "140px", color: "var(--dim)", margin: 0 }}>{t("settings.transcription_lang")}</label>
              <select
                value={transcriptionLanguage}
                onChange={async (e) => {
                  const val = e.target.value;
                  setTranscriptionLanguage(val);
                  await api.setSetting("transcription_language", val);
                }}
                style={{
                  flex: 1,
                  background: "var(--surface)",
                  color: "var(--text)",
                  border: "1px solid var(--hair)",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  fontSize: "12.5px",
                }}
              >
                <option value="it">Italiano (it)</option>
                <option value="en">English (en)</option>
                <option value="es">Español (es)</option>
                <option value="fr">Français (fr)</option>
                <option value="de">Deutsch (de)</option>
                <option value="auto">Auto-detect (auto)</option>
              </select>
            </div>

            <div style={{ fontSize: "11px", color: "var(--dim)" }}>{t("settings.transcription_note")}</div>
          </div>
        )}

        <div
          className="field"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 520,
            marginTop: 14,
          }}
        >
          <div>
            <label style={{ margin: 0 }}>{t("settings.dense.label")}</label>
            <div style={{ fontSize: "12px", color: "var(--dim)" }}>{t("settings.dense.sub")}</div>
          </div>
          <div className="seg">
            <button
              type="button"
              className={captureAllEvents ? "on" : ""}
              onClick={async () => {
                setCaptureAllEvents(true);
                await api.setSetting("capture_all_events", "true");
              }}
            >{t("settings.active")}</button>
            <button
              type="button"
              className={!captureAllEvents ? "on" : ""}
              onClick={async () => {
                setCaptureAllEvents(false);
                await api.setSetting("capture_all_events", "false");
              }}
            >{t("settings.inactive")}</button>
          </div>
        </div>

        <div className="field" style={{ maxWidth: 520, marginTop: 14 }}>
          <label htmlFor="settings-mon-select">{t("settings.monitor.label")}</label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              id="settings-mon-select"
              value={selectedMonitorId}
              onChange={async (e) => {
                const val = e.target.value;
                setSelectedMonitorId(val);
                await api.setSetting("selected_monitor_id", val);
              }}
              style={{
                flex: 1,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--hair)",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "13px",
              }}
            >
              {monitors.map((mon, i) => (
                <option key={mon.id || i} value={mon.id}>
                  {mon.name} {mon.is_primary ? "(Principale)" : ""} · {mon.width}x{mon.height}
                </option>
              ))}
              {monitors.length === 0 && (
                <option value="">{t("settings.primary_screen")}</option>
              )}
            </select>
            <button
              type="button"
              onClick={() => refreshMonitors()}
              style={{
                background: "transparent",
                border: "1px solid var(--hair)",
                padding: "8px 12px",
                borderRadius: "6px",
                color: "var(--text)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >{t("settings.detect")}</button>
          </div>
        </div>

        <div className="field" style={{ maxWidth: 520, marginTop: 14 }}>
          <label htmlFor="settings-mic-select">{t("settings.mic_default.label")}</label>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              id="settings-mic-select"
              value={selectedMicId}
              onChange={async (e) => {
                const val = e.target.value;
                setSelectedMicId(val);
                await api.setSetting("selected_microphone_id", val);
              }}
              style={{
                flex: 1,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--hair)",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "13px",
              }}
            >
              <option value="">{t("settings.system_default")}</option>
              {audioDevices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Microfono ${i + 1}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                navigator.mediaDevices
                  ?.getUserMedia({ audio: true })
                  .then((stream) => {
                    stream.getTracks().forEach((t) => t.stop());
                    return refreshDevices();
                  })
                  .catch(() => undefined);
              }}
              style={{
                background: "transparent",
                border: "1px solid var(--hair)",
                padding: "8px 12px",
                borderRadius: "6px",
                color: "var(--text)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >{t("settings.detect")}</button>
          </div>
        </div>
      </div>

      <div className="card set-card">
        <h3>Parametri AI & Modalità Thinking</h3>
        <div className="sub">
          Controlla il ragionamento (Think / No-Think) e specifica parametri JSON personalizzati inviati alle API dei modelli AI (LM Studio, Ollama, OpenAI, Claude, ecc.).
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
            Modalità Ragionamento (Think / No-Think)
          </label>
          <div className="seg" style={{ display: "inline-flex", marginBottom: 12 }}>
            <button
              type="button"
              className={aiThinkingMode === "auto" ? "on" : ""}
              onClick={async () => {
                setAiThinkingMode("auto");
                await api.setSetting("ai_thinking_mode", "auto");
              }}
            >
              Automatico (Consigliato)
            </button>
            <button
              type="button"
              className={aiThinkingMode === "think" ? "on" : ""}
              onClick={async () => {
                setAiThinkingMode("think");
                await api.setSetting("ai_thinking_mode", "think");
              }}
            >
              Think Abilitato
            </button>
            <button
              type="button"
              className={aiThinkingMode === "no_think" ? "on" : ""}
              onClick={async () => {
                setAiThinkingMode("no_think");
                await api.setSetting("ai_thinking_mode", "no_think");
              }}
            >
              Disabilita Think
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "12px 16px",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--hair)",
              fontSize: "12px",
              lineHeight: 1.5,
              marginBottom: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontWeight: 600, minWidth: 160 }}>📝 Generazione Documento:</span>
              <span style={{ color: aiThinkingMode === "no_think" ? "var(--dim)" : "#34d399" }}>
                {aiThinkingMode === "no_think"
                  ? "⚡ No-Think (disattivato da impostazione)"
                  : "🧠 Think attivo (analizza ed elabora le azioni con ragionamento)"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontWeight: 600, minWidth: 160 }}>🌐 Traduzione Documento:</span>
              <span style={{ color: "#38bdf8" }}>
                ⚡ No-Think forzato (traduzione diretta, massima velocità e zero riflessioni interne)
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontWeight: 600, margin: 0 }}>
              Parametri Personalizzati Richieste (JSON)
            </label>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => applyPreset({ temperature: 0.2 })}
                style={{
                  background: "transparent",
                  border: "1px solid var(--hair)",
                  borderRadius: "4px",
                  padding: "3px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                Preset Base
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset({
                    temperature: 0.3,
                    top_p: 0.95,
                    max_tokens: 4096,
                  })
                }
                style={{
                  background: "transparent",
                  border: "1px solid var(--hair)",
                  borderRadius: "4px",
                  padding: "3px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                Preset LM Studio / OpenAI
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset({
                    options: {
                      temperature: 0.2,
                      num_ctx: 8192,
                    },
                  })
                }
                style={{
                  background: "transparent",
                  border: "1px solid var(--hair)",
                  borderRadius: "4px",
                  padding: "3px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                Preset Ollama
              </button>
              <button
                type="button"
                onClick={() => applyPreset({})}
                style={{
                  background: "transparent",
                  border: "1px solid var(--hair)",
                  borderRadius: "4px",
                  padding: "3px 8px",
                  fontSize: "11px",
                  cursor: "pointer",
                  color: "var(--dim)",
                }}
              >
                Svuota ({})
              </button>
            </div>
          </div>

          <div style={{ fontSize: "12px", color: "var(--dim)", marginBottom: 10 }}>
            Questi parametri verranno inseriti direttamente nel payload della richiesta API inviata ai modelli AI.
          </div>

          <textarea
            value={aiCustomParams}
            onChange={(e) => {
              const val = e.target.value;
              setAiCustomParams(val);
              try {
                if (val.trim()) {
                  JSON.parse(val);
                }
                setCustomParamsError(null);
              } catch (err: any) {
                setCustomParamsError(`JSON non valido: ${err?.message ?? err}`);
              }
            }}
            onBlur={() => handleSaveCustomParams(aiCustomParams)}
            rows={5}
            style={{
              width: "100%",
              fontFamily: "Consolas, Monaco, monospace",
              fontSize: "12px",
              padding: "10px",
              borderRadius: "6px",
              background: "rgba(0, 0, 0, 0.25)",
              border: customParamsError ? "1px solid var(--rose)" : "1px solid var(--hair)",
              color: "var(--text)",
              resize: "vertical",
            }}
            placeholder={'{\n  "temperature": 0.2\n}'}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            {customParamsError ? (
              <span style={{ color: "var(--rose)", fontSize: "12px" }}>
                ⚠ {customParamsError}
              </span>
            ) : (
              <span style={{ color: "#34d399", fontSize: "12px" }}>
                ✓ JSON valido (salvato automaticamente)
              </span>
            )}

            <AppButton
              size="sm"
              kind="ghost"
              onClick={() => handleSaveCustomParams(aiCustomParams)}
            >
              💾 Salva Parametri
            </AppButton>
          </div>
        </div>
      </div>

      {providers.map((provider) => (
        <div key={provider.id} className="card set-card">
          <div className="prov-head">
            <span className="pg">{providerGlyph(provider.provider_type)}</span>
            <div>
              <h3>{provider.name}</h3>
              <div className="pid">{provider.provider_type}</div>
            </div>
            {activeProvider?.id === provider.id ? (
              <span className="active-tag">● Active</span>
            ) : null}
          </div>
          <div className="field-row" style={{ marginTop: 18 }}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`${provider.id}-key`}>API Key</label>
              <input
                id={`${provider.id}-key`}
                type="password"
                placeholder="sk-••••••••••••••••"
                defaultValue={provider.api_key ?? ""}
                onBlur={(event) =>
                  saveProvider({ ...provider, api_key: event.target.value })
                }
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor={`${provider.id}-model`}>Model</label>
              <input
                id={`${provider.id}-model`}
                defaultValue={provider.model ?? ""}
                onBlur={(event) =>
                  saveProvider({ ...provider, model: event.target.value })
                }
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor={`${provider.id}-url`}>Base URL</label>
            <input
              id={`${provider.id}-url`}
              defaultValue={provider.base_url ?? ""}
              onBlur={(event) =>
                saveProvider({ ...provider, base_url: event.target.value })
              }
            />
          </div>
          <div style={{ marginTop: 18 }}>
            <AppButton
              kind={activeProvider?.id === provider.id ? "ghost" : "primary"}
              onClick={() => {
                if (activeProvider?.id !== provider.id) {
                  saveProvider({ ...provider, enabled: 1 });
                }
              }}
            >
              {activeProvider?.id === provider.id ? "Active provider" : "Set Active"}
            </AppButton>
          </div>
        </div>
      ))}
    </div>
  );
}
