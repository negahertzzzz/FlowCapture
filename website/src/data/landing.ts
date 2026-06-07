export type DemoEvent = {
  ic: "mouse" | "key" | "win" | "scroll";
  lbl: string;
  meta: string;
  dim?: boolean;
};

export const DEMO_EVENTS: DemoEvent[] = [
  { ic: "win", lbl: "window focus", meta: "FlowCapture" },
  { ic: "mouse", lbl: "mouse click", meta: "right · 736,140", dim: true },
  { ic: "win", lbl: "window focus", meta: "System Settings" },
  { ic: "key", lbl: "key press", meta: "⌘ + ,", dim: true },
  { ic: "mouse", lbl: "mouse click", meta: "Software Update" },
  { ic: "scroll", lbl: "scroll", meta: "Δ −240", dim: true },
  { ic: "win", lbl: "window focus", meta: "Wi-Fi" },
  { ic: "mouse", lbl: "mouse click", meta: "Airtel_Cardio" },
];

export const EVENT_ICONS: Record<DemoEvent["ic"], string> = {
  mouse:
    '<path d="M5 3 19 12l-6 1.2L11 19 5 3Z"/>',
  key: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/>',
  win: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  scroll:
    '<rect x="8" y="3" width="8" height="18" rx="4"/><path d="M12 7v3"/>',
};

export const DOC_STEPS = [
  {
    title: "Open Software Update",
    desc: "Switch to System Settings and open the Software Update pane.",
  },
  {
    title: "Review available update",
    desc: "macOS Tahoe 26.5.1 — 2.14 GB. Read the release notes.",
  },
  {
    title: "Connect to Wi-Fi network",
    desc: "Select the secured network and confirm the connection.",
  },
];

export type FormatId = "md" | "html" | "pdf" | "video";

export const FORMAT_TABS: { id: FormatId; label: string; icon: string }[] = [
  {
    id: "md",
    label: "Markdown",
    icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 15V9l3 3 3-3v6M18 9v6m0 0-2-2m2 2 2-2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  {
    id: "html",
    label: "HTML",
    icon: '<path d="m9 9-3 3 3 3m6-6 3 3-3 3"/>',
  },
  {
    id: "pdf",
    label: "PDF",
    icon: '<path d="M14 3v4a1 1 0 0 0 1 1h4M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/>',
  },
  {
    id: "video",
    label: "Video",
    icon: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="m17 10 4-2v8l-4-2"/>',
  },
];

export type ReplayStep = {
  title: string;
  desc: string;
  listTitle: string;
  listDesc: string;
  image: string;
  x: number;
  y: number;
};

export const REPLAY_STEPS: ReplayStep[] = [
  {
    title: "Open Software Update",
    desc: "Switch to System Settings and open the Software Update pane.",
    listTitle: "Open Software Update",
    listDesc: "Navigate to the pane in System Settings.",
    image: "/replay/step-1.png",
    x: 55,
    y: 47,
  },
  {
    title: "Review available update",
    desc:
      "macOS Tahoe 26.5.1 (2.14 GB) is available. Read the release notes before installing.",
    listTitle: "Review available update",
    listDesc: "macOS Tahoe 26.5.1 — 2.14 GB.",
    image: "/replay/step-2.png",
    x: 75,
    y: 20,
  },
  {
    title: "Click on Update Tonight",
    desc: "Confirm the update tonight when you're ready to install.",
    listTitle: "Click on Update Tonight",
    listDesc: "Click Update Tonight to begin the update.",
    image: "/replay/step-3.png",
    x: 58,
    y: 89,
  },
];
