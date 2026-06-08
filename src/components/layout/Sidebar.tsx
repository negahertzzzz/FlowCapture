import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { useSessionsContext } from "@/context/SessionsContext";
import { statusDotClass } from "@/lib/icons";
import { formatDuration } from "@/lib/utils";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessions } = useSessionsContext();

  return (
    <aside className="side">
      <div className="logo">
        <Logo />
        <div>
          <div className="lt">FlowCapture</div>
          <div className="ls">Workflow documentation</div>
        </div>
      </div>

      <NavLink
        to="/"
        end
        className={({ isActive }) => `nav-i${isActive ? " active" : ""}`}
      >
        <Icon name="home" /> Home
      </NavLink>
      <NavLink
        to="/settings"
        className={({ isActive }) => `nav-i${isActive ? " active" : ""}`}
      >
        <Icon name="settings" /> Settings
      </NavLink>

      <div className="side-sessions">
        <div className="sh">
          <span>Sessions</span>
          <span>{sessions.length}</span>
        </div>
        <div className="side-sessions-list">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`ss-item${location.pathname === `/sessions/${session.id}` ? " active" : ""}`}
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
              <div className="st">{session.title}</div>
              <div className="sm">
                <span className={`dotstat ${statusDotClass(session.status)}`} />
                {session.status} · {formatDuration(session.duration)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="side-foot">
        <div className="ft">
          <Icon name="shield" size={15} />
          <span>
            <b style={{ color: "var(--text-2)" }}>Local-first.</b> Sessions,
            screenshots and exports never leave this Mac.
          </span>
        </div>
      </div>
    </aside>
  );
}
