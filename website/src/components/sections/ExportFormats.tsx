import { useState } from "react";
import { FORMAT_TABS, type FormatId } from "../../data/landing";

export function ExportFormats() {
  const [activeFormat, setActiveFormat] = useState<FormatId>("md");

  return (
    <section className="blk wrap" id="formats">
      <div className="sec-head reveal">
        <span className="eyebrow">Exports</span>
        <h2>One session. Every format you ship.</h2>
        <p>
          Generate once, then export to whatever your team reads — and tweak the
          Markdown source before it goes out. Try the{" "}
          <a href="#pdf-export">live PDF studio</a> below.
        </p>
      </div>
      <div className="reveal">
        <div className="fmt-tabs" role="tablist">
          {FORMAT_TABS.map((tab) => (
            <button
              key={tab.id}
              className="fmt-tab"
              role="tab"
              aria-selected={activeFormat === tab.id}
              onClick={() => setActiveFormat(tab.id)}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                dangerouslySetInnerHTML={{ __html: tab.icon }}
              />
              {tab.label}
            </button>
          ))}
        </div>
        <div className="fmt-stage">
          <div
            className={`fmt-pane${activeFormat === "md" ? " active" : ""}`}
            data-pane="md"
          >
            <div className="md-body">
              <span className="h"># Navigating System Settings Panes</span>
              {"\n\n"}
              This guide shows how to navigate and interact with various panes
              within <span className="b">System Settings</span>, across 15 steps.
              {"\n\n"}
              <span className="h">## Step 1 — Open Software Update</span>
              {"\n"}
              Switch to <span className="b">System Settings</span> and open the{" "}
              <span className="b">Software Update</span> pane.
              {"\n\n"}
              <span className="h">## Step 2 — Review the available update</span>
              {"\n"}
              macOS Tahoe `26.5.1` (2.14 GB) is available to install.
            </div>
          </div>
          <div
            className={`fmt-pane${activeFormat === "html" ? " active" : ""}`}
            data-pane="html"
          >
            <div className="html-doc">
              <h3 style={{ color: "var(--text)" }}>
                Navigating System Settings Panes
              </h3>
              <p>
                This guide demonstrates how to navigate and interact with
                various panes within{" "}
                <strong style={{ color: "var(--text)" }}>System Settings</strong>
                , including Software Update, Wi-Fi and Battery — across 15 steps.
              </p>
              <div
                style={{
                  marginTop: 18,
                  padding: "14px 16px",
                  border: "1px solid var(--hair)",
                  borderRadius: 10,
                  background: "rgba(255,255,255,.014)",
                }}
              >
                <div
                  style={{
                    color: "var(--mint)",
                    fontFamily: "var(--mono)",
                    fontSize: 12,
                  }}
                >
                  STEP 1
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    color: "var(--text)",
                    marginTop: 6,
                  }}
                >
                  Open Software Update
                </div>
                <p style={{ marginTop: 6 }}>
                  Switch to System Settings and open the Software Update pane.
                </p>
              </div>
              <p
                style={{
                  marginTop: 14,
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  color: "var(--dim)",
                }}
              >
                → Self-contained, shareable, themed to match your docs.
              </p>
            </div>
          </div>
          <div
            className={`fmt-pane${activeFormat === "pdf" ? " active" : ""}`}
            data-pane="pdf"
          >
            <div style={{ display: "grid", placeItems: "center" }}>
              <div className="pdf-page">
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    color: "#2bcf97",
                    letterSpacing: ".1em",
                  }}
                >
                  FLOWCAPTURE · SOP
                </div>
                <h3 style={{ marginTop: 8 }}>
                  Navigating System Settings Panes
                </h3>
                <p>
                  A 15-step standard operating procedure generated from a
                  23-second recording.
                </p>
                <div className="pstep">
                  <strong>Step 1 · Open Software Update</strong>
                  <p>
                    Switch to System Settings and open the Software Update pane.
                  </p>
                </div>
                <div className="pstep">
                  <strong>Step 2 · Review the available update</strong>
                  <p>macOS Tahoe 26.5.1 (2.14 GB) is available.</p>
                </div>
              </div>
            </div>
          </div>
          <div
            className={`fmt-pane${activeFormat === "video" ? " active" : ""}`}
            data-pane="video"
          >
            <div className="video-stage">
              <div className="video-frame">
                <div className="play">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <div className="scrub">
                  <i />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
