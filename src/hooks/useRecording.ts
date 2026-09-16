import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Session, type MonitorInfo } from "@/lib/api";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = (reader.result as string) || "";
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useRecording() {
  const navigate = useNavigate();
  const [recording, setRecording] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monitor options
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [selectedMonitorId, setSelectedMonitorIdState] = useState<string>("");

  // Pause & mute states
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Audio & click options
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicIdState] = useState<string>("");
  const [recordAudio, setRecordAudioState] = useState<boolean>(false);
  const [transcribeAudio, setTranscribeAudioState] = useState<boolean>(true);
  const [highlightClicks, setHighlightClicksState] = useState<boolean>(true);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const setSelectedMonitorId = useCallback((id: string) => {
    setSelectedMonitorIdState(id);
    void api.setSetting("selected_monitor_id", id);
  }, []);

  const switchMonitor = useCallback(async (newMonId: string) => {
    setSelectedMonitorId(newMonId);
    try {
      await api.switchRecordingMonitor(newMonId);
    } catch (err) {
      console.warn("Failed to switch recording monitor:", err);
    }
  }, [setSelectedMonitorId]);

  const toggleMute = useCallback(() => {
    if (audioStreamRef.current) {
      const tracks = audioStreamRef.current.getAudioTracks();
      const nextMuted = !isMuted;
      tracks.forEach((track) => {
        track.enabled = !nextMuted;
      });
      setIsMuted(nextMuted);
    }
  }, [isMuted]);

  const pause = useCallback(async () => {
    try {
      await api.pauseRecording();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.pause();
      }
      setIsPaused(true);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const resume = useCallback(async () => {
    try {
      await api.resumeRecording();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
        mediaRecorderRef.current.resume();
      }
      setIsPaused(false);
    } catch (err) {
      setError(String(err));
    }
  }, []);

  const refreshMonitors = useCallback(async () => {
    try {
      const list = await api.listMonitors();
      setMonitors(list);
      setSelectedMonitorIdState((prev) => {
        if (prev && list.some((m) => m.id === prev)) return prev;
        const primary = list.find((m) => m.is_primary);
        return primary ? primary.id : (list[0]?.id ?? "");
      });
    } catch {
      // Ignored
    }
  }, []);

  const setSelectedMicId = useCallback((id: string) => {
    setSelectedMicIdState(id);
    void api.setSetting("selected_microphone_id", id);
  }, []);

  const switchMicrophone = useCallback(async (newMicId: string) => {
    setSelectedMicId(newMicId);
    if (!audioStreamRef.current || !mediaRecorderRef.current) return;
    try {
      const constraints: MediaStreamConstraints = {
        audio: newMicId ? { deviceId: { exact: newMicId } } : true,
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = newStream.getAudioTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = !isMuted;

      audioStreamRef.current.getAudioTracks().forEach((t) => t.stop());
      audioStreamRef.current = newStream;
    } catch (err) {
      console.warn("Failed to switch microphone:", err);
    }
  }, [isMuted, setSelectedMicId]);

  const setRecordAudio = useCallback((enabled: boolean) => {
    setRecordAudioState(enabled);
    void api.setSetting("record_audio", enabled ? "true" : "false");
  }, []);

  const setTranscribeAudio = useCallback((enabled: boolean) => {
    setTranscribeAudioState(enabled);
    void api.setSetting("transcribe_audio", enabled ? "true" : "false");
  }, []);

  const setHighlightClicks = useCallback((enabled: boolean) => {
    setHighlightClicksState(enabled);
    void api.setSetting("highlight_clicks", enabled ? "true" : "false");
  }, []);

  const refreshAudioDevices = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === "audioinput");
      setAudioDevices(mics);
    } catch {
      // Ignored if permissions not yet granted
    }
  }, []);

  async function refreshRecording() {
    const sessions = await api.listSessions();
    setRecording(sessions.find((session) => session.status === "recording") ?? null);
  }

  // Load saved settings & initial devices
  useEffect(() => {
    refreshRecording().catch((err) => setError(String(err)));
    refreshMonitors().catch(() => undefined);
    refreshAudioDevices().catch(() => undefined);

    Promise.all([
      api.getSetting("selected_monitor_id"),
      api.getSetting("selected_microphone_id"),
      api.getSetting("record_audio"),
      api.getSetting("transcribe_audio"),
      api.getSetting("highlight_clicks"),
    ])
      .then(([savedMonitor, savedMic, savedRecord, savedTranscribe, savedHighlight]) => {
        if (savedMonitor) setSelectedMonitorIdState(savedMonitor);
        if (savedMic) setSelectedMicIdState(savedMic);
        if (savedRecord !== null) setRecordAudioState(savedRecord === "true");
        if (savedTranscribe !== null) setTranscribeAudioState(savedTranscribe !== "false");
        if (savedHighlight !== null) setHighlightClicksState(savedHighlight !== "false");
      })
      .catch(() => undefined);
  }, [refreshAudioDevices, refreshMonitors]);

  async function start(title?: string) {
    setLoading(true);
    setError(null);
    try {
      const permissions = await api.prepareRecordingPermissions();
      if (!permissions.can_record) {
        throw new Error(
          `${permissions.message} Enable \`${permissions.process_name}\` in System Settings, then quit and reopen FlowCapture before trying again.`,
        );
      }

      // Start audio recording if enabled
      if (recordAudio && navigator?.mediaDevices?.getUserMedia) {
        try {
          const constraints: MediaStreamConstraints = {
            audio: selectedMicId ? { deviceId: { exact: selectedMicId } } : true,
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          audioStreamRef.current = stream;
          audioChunksRef.current = [];

          // Determine supported mime type
          let mimeType = "audio/webm";
          if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            mimeType = "audio/webm;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
            mimeType = "audio/ogg;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          }

          const recorder = new MediaRecorder(stream, { mimeType });
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              audioChunksRef.current.push(event.data);
            }
          };
          recorder.start(500);
          mediaRecorderRef.current = recorder;
          // Refresh list of devices now that permission was granted
          refreshAudioDevices().catch(() => undefined);
        } catch (micErr) {
          console.warn("Could not start microphone recording:", micErr);
        }
      }

      const session = await api.startRecording(
        title ?? "New Workflow Session",
        selectedMonitorId || undefined,
      );
      setRecording(session);
      return session;
    } catch (err) {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      mediaRecorderRef.current = null;
      setError(String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function stop() {
    setLoading(true);
    setError(null);

    // Stop audio stream and get recorded blob
    let audioBlobPromise: Promise<{ base64: string; mimeType: string } | null> = Promise.resolve(null);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      audioBlobPromise = new Promise((resolve) => {
        const recorder = mediaRecorderRef.current!;
        const mimeType = recorder.mimeType || "audio/webm";
        recorder.onstop = async () => {
          try {
            const blob = new Blob(audioChunksRef.current, { type: mimeType });
            if (blob.size > 0) {
              const base64 = await blobToBase64(blob);
              resolve({ base64, mimeType });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        };
        recorder.stop();
      });
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    mediaRecorderRef.current = null;

    try {
      const session = await api.stopRecording();
      setRecording(null);

      // Save recorded audio if any
      const audioData = await audioBlobPromise;
      if (audioData) {
        try {
          await api.saveSessionAudio(session.id, audioData.base64, audioData.mimeType);

          // If auto-transcribe is enabled, trigger background transcription
          if (transcribeAudio) {
            api.transcribeSessionAudio(session.id).catch((transcribeErr) => {
              console.warn("Auto-transcription error:", transcribeErr);
            });
          }
        } catch (audioSaveErr) {
          console.warn("Failed to save session audio:", audioSaveErr);
        }
      }

      navigate(`/sessions/${session.id}`);
      return session;
    } catch (err) {
      setError(String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function markStep() {
    try {
      await api.captureManualScreenshot();
    } catch (err) {
      setError(String(err));
      throw err;
    }
  }

  const selectedMonitor = monitors.find((m) => m.id === selectedMonitorId);
  const selectedMonitorName = selectedMonitor
    ? `${selectedMonitor.name}${selectedMonitor.is_primary ? " (Principale)" : ""} · ${selectedMonitor.width}x${selectedMonitor.height}`
    : "Primary Display";

  return {
    recording,
    loading,
    error,
    setError,
    start,
    stop,
    markStep,
    refreshRecording,
    monitors,
    selectedMonitorId,
    setSelectedMonitorId,
    selectedMonitorName,
    refreshMonitors,
    audioDevices,
    selectedMicId,
    setSelectedMicId,
    recordAudio,
    setRecordAudio,
    transcribeAudio,
    setTranscribeAudio,
    highlightClicks,
    setHighlightClicks,
    refreshAudioDevices,
    isPaused,
    isMuted,
    pause,
    resume,
    toggleMute,
    switchMicrophone,
    switchMonitor,
  };
}
