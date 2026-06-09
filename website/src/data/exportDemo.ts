export type ExportFormat = "pdf" | "html";

export type ExportTheme = "dark" | "light";

export type ExportAccent = "mint" | "blue" | "violet" | "amber";

export type ExportPageSize = "letter" | "a4";

export type ExportOptions = {
  theme: ExportTheme;
  accent: ExportAccent;
  pageSize: ExportPageSize;
  cover: boolean;
  screenshots: boolean;
  stepNumbers: boolean;
  timestamps: boolean;
  annotations: boolean;
  branding: boolean;
};

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  theme: "dark",
  accent: "mint",
  pageSize: "letter",
  cover: true,
  screenshots: true,
  stepNumbers: true,
  timestamps: true,
  annotations: true,
  branding: true,
};

export const ACCENT_COLORS: Record<ExportAccent, { dark: string; light: string }> = {
  mint: { dark: "#5fe9b8", light: "#11a87a" },
  blue: { dark: "#6cc6ff", light: "#1d74d1" },
  violet: { dark: "#b69bff", light: "#6b46d9" },
  amber: { dark: "#f4c66a", light: "#b07d12" },
};

export function exportAccentInk(theme: ExportTheme) {
  return theme === "light" ? "#ffffff" : "#06231b";
}

export function exportAccentColor(accent: ExportAccent, theme: ExportTheme) {
  return ACCENT_COLORS[accent][theme === "light" ? "light" : "dark"];
}

export type DemoExportStep = {
  title: string;
  description: string;
  timestamp: string;
  image: string;
  trigger: string;
  ring: { x: string; y: string };
  cursor: { x: string; y: string };
};

export const DEMO_EXPORT_STEPS: DemoExportStep[] = [
  {
    title: "Open Software Update",
    description:
      "Switch to **System Settings** and open the **Software Update** pane from the sidebar.",
    timestamp: "00:04",
    image: "/replay/step-1.png",
    trigger: "window focus",
    ring: { x: "28%", y: "42%" },
    cursor: { x: "26%", y: "40%" },
  },
  {
    title: "Review the available update",
    description:
      "macOS Tahoe `26.5.1` (2.14 GB) is available. Read the release notes before installing.",
    timestamp: "00:11",
    image: "/replay/step-2.png",
    trigger: "mouse click",
    ring: { x: "72%", y: "22%" },
    cursor: { x: "70%", y: "20%" },
  },
  {
    title: "Connect to Wi-Fi network",
    description:
      "Select the secured network and confirm the connection to finish setup.",
    timestamp: "00:18",
    image: "/replay/step-3.png",
    trigger: "mouse click",
    ring: { x: "58%", y: "62%" },
    cursor: { x: "56%", y: "60%" },
  },
];

export const DEMO_DOC_TITLE = "Navigating System Settings Panes";
export const DEMO_DOC_OVERVIEW =
  "A step-by-step standard operating procedure generated from a 23-second recording with screenshots and workflow context.";
