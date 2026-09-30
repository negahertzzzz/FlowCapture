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

export interface PauseClock {
  /** Total length of the pauses that already ended. */
  pausedMs: number;
  /** When the current pause started, or `null` while recording. */
  pausedAt: number | null;
}

const NO_PAUSES: PauseClock = { pausedMs: 0, pausedAt: null };

/** Recorded seconds since `startedAt`, not counting pauses. */
export function recordedSeconds(startedAt: string, clock: PauseClock, now = Date.now()): number {
  const current = clock.pausedAt === null ? 0 : now - clock.pausedAt;
  const ms = now - new Date(startedAt).getTime() - clock.pausedMs - current;
  return Math.max(0, Math.floor(ms / 1000));
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
  // Time spent paused, so the REC timer shows recorded time only (the backend does the same).
  const [pauseClock, setPauseClock] = useState<PauseClock>(NO_PAUSES);
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
  // The recorder records a Web Audio destination, not the microphone stream itself: switching
  // microphone only re-plugs the source node and the recording keeps going. Recording the mic
  // stream directly ends the recorder (and loses the audio) as soon as its track is stopped.
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  /** Detaches the current microphone graph and returns a function that shuts it down. */
  const detachAudio = useCallback(() => {
    const stream = audioStreamRef.current;
    const source = audioSourceRef.current;
    const context = audioContextRef.current;
    audioStreamRef.current = null;
    audioSourceRef.current = null;
    audioDestRef.current = null;
    audioContextRef.current = null;
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
      source?.disconnect();
      void context?.close().catch(() => undefined);
    };
  }, []);

  const releaseAudio = useCallback(() => detachAudio()(), [detachAudio]);

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
      setPauseClock((clock) => (clock.pausedAt === null ? { ...clock, pausedAt: Date.now() } : clock));
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
      setPauseClock((clock) =>
        clock.pausedAt === null
          ? clock
          : { pausedMs: clock.pausedMs + (Date.now() - clock.pausedAt), pausedAt: null },
      );
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
      const context = audioContextRef.current;
      const destination = audioDestRef.current;
      if (!newTrack || !context || !destination) {
        // Without the Web Audio graph the recorder is bound to the current microphone:
        // keep it rather than stopping the recording.
        newStream.getTracks().forEach((t) => t.stop());
        return;
      }
      newTrack.enabled = !isMuted;

      const newSource = context.createMediaStreamSource(newStream);
      newSource.connect(destination);
      audioSourceRef.current?.disconnect();
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioSourceRef.current = newSource;
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

          let recordedStream = stream;
          if (typeof AudioContext !== "undefined") {
            const context = new AudioContext();
            const destination = context.createMediaStreamDestination();
            const source = context.createMediaStreamSource(stream);
            source.connect(destination);
            void context.resume().catch(() => undefined);
            audioContextRef.current = context;
            audioSourceRef.current = source;
            audioDestRef.current = destination;
            recordedStream = destination.stream;
          }

          // Determine supported mime type
          let mimeType = "audio/webm";
          if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
            mimeType = "audio/webm;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
            mimeType = "audio/ogg;codecs=opus";
          } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
            mimeType = "audio/mp4";
          }

          const recorder = new MediaRecorder(recordedStream, { mimeType });
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
          releaseAudio();
          mediaRecorderRef.current = null;
          console.warn("Could not start microphone recording:", micErr);
        }
      }

      const session = await api.startRecording(
        title ?? "New Workflow Session",
        selectedMonitorId || undefined,
      );
      setPauseClock(NO_PAUSES);
      setIsPaused(false);
      setRecording(session);
      return session;
    } catch (err) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      releaseAudio();
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
    const closeAudio = detachAudio();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      audioBlobPromise = new Promise((resolve) => {
        const recorder = mediaRecorderRef.current!;
        const mimeType = recorder.mimeType || "audio/webm";
        recorder.onstop = async () => {
          // Tear the audio graph down only now: closing it earlier ends the recorded track
          // before the last chunk is flushed.
          closeAudio();
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
    } else {
      closeAudio();
    }
    mediaRecorderRef.current = null;

    try {
      const session = await api.stopRecording();
      setRecording(null);
      setIsPaused(false);
      setIsMuted(false);
      setPauseClock(NO_PAUSES);

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
    pauseClock,
    isMuted,
    pause,
    resume,
    toggleMute,
    switchMicrophone,
    switchMonitor,
  };
}
