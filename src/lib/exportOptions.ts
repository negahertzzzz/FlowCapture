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

export function toApiExportOptions(options: ExportOptions) {
  return {
    theme: options.theme,
    accent: options.accent,
    pageSize: options.pageSize,
    cover: options.cover,
    screenshots: options.screenshots,
    stepNumbers: options.stepNumbers,
    timestamps: options.timestamps,
    annotations: options.annotations,
    branding: options.branding,
  };
}
