import { useEffect, useState } from "react";
import { AppButton } from "@/components/ui/AppButton";
import { api, type ProviderConfig } from "@/lib/api";
import { providerGlyph } from "@/lib/icons";

export function SettingsPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [redactionEnabled, setRedactionEnabled] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [nextProviders, nextSetting] = await Promise.all([
      api.listProviders(),
      api.getSetting("redaction_enabled"),
    ]);
    setProviders(nextProviders);
    setRedactionEnabled((nextSetting ?? "true") === "true");
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
