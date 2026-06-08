import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppButton } from "@/components/ui/AppButton";
import { Icon } from "@/components/ui/Icon";
import { PermissionsBanner } from "@/components/recording/PermissionsBanner";
import { SessionThumbnail } from "@/components/sessions/SessionThumbnail";
import { useRecordingContext } from "@/context/RecordingContext";
import { useSessionsContext } from "@/context/SessionsContext";
import { api } from "@/lib/api";
import { statusBadgeClass } from "@/lib/icons";
import { formatDuration, formatTimestamp } from "@/lib/utils";

export function HomePage() {
  const navigate = useNavigate();
  const { loading, error, setError, start } = useRecordingContext();
  const { sessions, refreshSessions } = useSessionsContext();
  const [platform, setPlatform] = useState("");
  const [canRecord, setCanRecord] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  function handlePermissionsChange(
    permissions: Awaited<ReturnType<typeof api.getRecordingPermissions>>,
  ) {
    setCanRecord(permissions.can_record);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const nextPlatform = await api.getPlatformName();
      await refreshSessions();
      setPlatform(nextPlatform);
    } catch (err) {
      setError(String(err));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(String(err)));
  }, [setError]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "r" &&
        canRecord &&
        !loading
      ) {
        event.preventDefault();
        start().catch(() => undefined);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canRecord, loading, start]);

  return (
    <div className="page">
      <div className="home-hero home-top">
        <div>
          <div className="kick">FLOWCAPTURE</div>
          <h1>Turn workflows into documentation</h1>
          <p className="lead">
            Record screen activity, capture input events, and generate Markdown, HTML,
            PDF and video exports with your own AI provider.
          </p>
        </div>
        <span className="plat">
          <Icon name="monitor" size={15} /> Platform: {platform || "detecting…"}
        </span>
      </div>

      <PermissionsBanner onPermissionsChange={handlePermissionsChange} />

      <div className="card rec-card">
        <h3>Recording</h3>
        <p>
          Start a new session to record your screen, mouse activity, keyboard input, and
          window changes.
        </p>
        <div className="rec-actions">
          <AppButton
            kind="primary"
            icon="play"
            disabled={loading || !canRecord}
            onClick={() => start().catch(() => undefined)}
          >
            Start Recording
          </AppButton>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--dim)" }}>
            ⌘⇧R
          </span>
        </div>
      </div>

      {error ? (
        <div
          className="card set-card"
          style={{ marginTop: 18, borderColor: "rgba(255,138,138,.35)", color: "var(--rose)" }}
        >
          {error}
        </div>
      ) : null}

      <div className="sec-row">
        <h2>Recent Sessions</h2>
        <AppButton
          size="sm"
          icon="refresh"
          className={refreshing ? "is-spinning" : undefined}
          disabled={refreshing}
          onClick={() => refresh()}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </AppButton>
      </div>
      <div className="sess-list">
        {sessions.length === 0 ? (
          <div className="card panel">
            <div className="pd">
              No sessions yet. Start your first recording to build documentation.
            </div>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className="sess"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/sessions/${session.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(`/sessions/${session.id}`);
                }
              }}
            >
              <SessionThumbnail path={session.preview_screenshot_path} />
              <div className="sinfo">
                <div className="stt">{session.title}</div>
                <div className="stm">
                  {formatTimestamp(session.started_at)}
                  <span className={`badge ${statusBadgeClass(session.status)}`}>
                    {session.status}
                  </span>
                  <span>{formatDuration(session.duration)}</span>
                </div>
              </div>
              <div className="sdur">{formatDuration(session.duration)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
