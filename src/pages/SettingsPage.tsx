import { useEffect, useState } from "react";
import { AppButton } from "@/components/ui/AppButton";
import { api, type ProviderConfig, type MonitorInfo } from "@/lib/api";
import { providerGlyph } from "@/lib/icons";

export function SettingsPage() {
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      nextMonitors,
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
      api.listMonitors().catch(() => [] as MonitorInfo[]),
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
    if (nextMicId) setSelectedMicId(nextMicId);
    if (nextMonitorId) setSelectedMonitorId(nextMonitorId);
    setMonitors(nextMonitors);
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

  const activeProvider = providers.find((provider) => provider.enabled);

  return (
    <div className="page">
      <div className="home-hero">
        <h1 style={{ fontSize: 34 }}>Settings</h1>
        <p className="lead">Configure BYOK AI providers and privacy controls.</p>
      </div>

      {message ? (
        <div className="banner" style={{ marginTop: 18 }}>
          <span className="bt">{message}</span>
        </div>
      ) : null}
      {error ? (
        <div
          className="card set-card"
          style={{ marginTop: 18, borderColor: "rgba(255,138,138,.35)", color: "var(--rose)" }}
        >
          {error}
        </div>
      ) : null}

      <div className="card set-card">
        <h3>Privacy</h3>
        <div className="sub">
          Sensitive data — passwords, API keys, tokens, emails — is redacted before any
          prompt is sent to a cloud provider.
        </div>
        <div
          className="field"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            maxWidth: 420,
          }}
        >
          <label style={{ margin: 0 }}>Redaction</label>
          <div className="seg">
            <button
              type="button"
              className={redactionEnabled ? "on" : ""}
              onClick={async () => {
                setRedactionEnabled(true);
                await api.setSetting("redaction_enabled", "true");
              }}
            >
              Enabled
            </button>
            <button
              type="button"
              className={!redactionEnabled ? "on" : ""}
              onClick={async () => {
                setRedactionEnabled(false);
                await api.setSetting("redaction_enabled", "false");
              }}
            >
              Disabled
            </button>
          </div>
        </div>
      </div>

      <div className="card set-card">
        <h3>Recording & Audio Options</h3>
        <div className="sub">
          Configura l'acquisizione del microfono, la trascrizione vocale automatica e l'evidenziazione dei click del mouse.
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
            <label style={{ margin: 0 }}>Evidenzia click del mouse</label>
            <div style={{ fontSize: "12px", color: "var(--dim)" }}>
              Disegna un cerchio evidente ad alto contrasto dove viene cliccato negli screenshot
            </div>
          </div>
          <div className="seg">
            <button
              type="button"
              className={highlightClicks ? "on" : ""}
              onClick={async () => {
                setHighlightClicks(true);
                await api.setSetting("highlight_clicks", "true");
              }}
            >
              Attivo
            </button>
            <button
              type="button"
              className={!highlightClicks ? "on" : ""}
              onClick={async () => {
                setHighlightClicks(false);
                await api.setSetting("highlight_clicks", "false");
              }}
            >
              Disattivo
            </button>
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
            <label style={{ margin: 0 }}>Registra audio microfono</label>
            <div style={{ fontSize: "12px", color: "var(--dim)" }}>
              Registra l'audio vocale dal microfono scelto durante le sessioni
            </div>
          </div>
          <div className="seg">
            <button
              type="button"
              className={recordAudio ? "on" : ""}
              onClick={async () => {
                setRecordAudio(true);
                await api.setSetting("record_audio", "true");
              }}
            >
              Attivo
            </button>
            <button
              type="button"
              className={!recordAudio ? "on" : ""}
              onClick={async () => {
                setRecordAudio(false);
                await api.setSetting("record_audio", "false");
              }}
            >
              Disattivo
            </button>
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
            <label style={{ margin: 0 }}>Trascrizione audio automatica (AI)</label>
            <div style={{ fontSize: "12px", color: "var(--dim)" }}>
              Trascrive il parlato e lo usa per generare la documentazione dei passaggi
            </div>
          </div>
          <div className="seg">
            <button
              type="button"
              className={transcribeAudio ? "on" : ""}
              onClick={async () => {
                setTranscribeAudio(true);
                await api.setSetting("transcribe_audio", "true");
              }}
            >
              Attivo
            </button>
            <button
              type="button"
              className={!transcribeAudio ? "on" : ""}
              onClick={async () => {
                setTranscribeAudio(false);
                await api.setSetting("transcribe_audio", "false");
              }}
            >
              Disattivo
            </button>
          </div>
        </div>

        {transcribeAudio && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              maxWidth: 520,
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--text-1)", fontWeight: 500 }}>
              Configurazione Motore di Trascrizione
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "12px", minWidth: "140px", color: "var(--dim)", margin: 0 }}>
                Provider Trascrizione:
              </label>
              <select
                value={transcriptionProviderId}
                onChange={async (e) => {
                  const val = e.target.value;
                  setTranscriptionProviderId(val);
                  await api.setSetting("transcription_provider_id", val);
                }}
                style={{
                  flex: 1,
                  background: "var(--bg-3, #151b23)",
                  color: "var(--text-1)",
                  border: "1px solid var(--border)",
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
              <label style={{ fontSize: "12px", minWidth: "140px", color: "var(--dim)", margin: 0 }}>
                Modello Audio:
              </label>
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
                  background: "var(--bg-3, #151b23)",
                  color: "var(--text-1)",
                  border: "1px solid var(--border)",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  fontSize: "12.5px",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "12px", minWidth: "140px", color: "var(--dim)", margin: 0 }}>
                Base URL Trascrizione:
              </label>
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
                  background: "var(--bg-3, #151b23)",
                  color: "var(--text-1)",
                  border: "1px solid var(--border)",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  fontSize: "12.5px",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <label style={{ fontSize: "12px", minWidth: "140px", color: "var(--dim)", margin: 0 }}>
                Lingua Trascrizione:
              </label>
              <select
                value={transcriptionLanguage}
                onChange={async (e) => {
                  const val = e.target.value;
                  setTranscriptionLanguage(val);
                  await api.setSetting("transcription_language", val);
                }}
                style={{
                  flex: 1,
                  background: "var(--bg-3, #151b23)",
                  color: "var(--text-1)",
                  border: "1px solid var(--border)",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  fontSize: "12.5px",
                }}
              >
                <option value="it">Italiano (it)</option>
                <option value="en">Inglese (en)</option>
                <option value="es">Spagnolo (es)</option>
                <option value="fr">Francese (fr)</option>
                <option value="de">Tedesco (de)</option>
                <option value="auto">Rilevamento automatico (auto)</option>
              </select>
            </div>

            <div style={{ fontSize: "11px", color: "var(--dim)" }}>
              💡 Per <b>Ollama o server self-hosted</b>: puoi configurare un URL personalizzato (es. <code>http://localhost:11434</code> o <code>http://localhost:8000</code> per un server whisper.cpp / faster-whisper locale).
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
            <label style={{ margin: 0 }}>Screenshot su ogni evento (Modalità densa)</label>
            <div style={{ fontSize: "12px", color: "var(--dim)" }}>
              Cattura screenshot per qualsiasi tasto e scorrimento rotellina, non solo click del mouse
            </div>
          </div>
          <div className="seg">
            <button
              type="button"
              className={captureAllEvents ? "on" : ""}
              onClick={async () => {
                setCaptureAllEvents(true);
                await api.setSetting("capture_all_events", "true");
              }}
            >
              Attivo
            </button>
            <button
              type="button"
              className={!captureAllEvents ? "on" : ""}
              onClick={async () => {
                setCaptureAllEvents(false);
                await api.setSetting("capture_all_events", "false");
              }}
            >
              Disattivo
            </button>
          </div>
        </div>

        <div className="field" style={{ maxWidth: 520, marginTop: 14 }}>
          <label htmlFor="settings-mon-select">Schermo predefinito da registrare</label>
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
                background: "var(--bg-3, #151b23)",
                color: "var(--text-1)",
                border: "1px solid var(--border)",
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
                <option value="">Schermo Principale</option>
              )}
            </select>
            <button
              type="button"
              onClick={() => refreshMonitors()}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                padding: "8px 12px",
                borderRadius: "6px",
                color: "var(--text-1)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Rileva
            </button>
          </div>
        </div>

        <div className="field" style={{ maxWidth: 520, marginTop: 14 }}>
          <label htmlFor="settings-mic-select">Microfono predefinito</label>
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
                background: "var(--bg-3, #151b23)",
                color: "var(--text-1)",
                border: "1px solid var(--border)",
                padding: "8px 12px",
                borderRadius: "6px",
                fontSize: "13px",
              }}
            >
              <option value="">Microfono di Sistema Predefinito</option>
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
                border: "1px solid var(--border)",
                padding: "8px 12px",
                borderRadius: "6px",
                color: "var(--text-1)",
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              Rileva
            </button>
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
