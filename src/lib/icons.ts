export const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/>',
  settings:
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v2M12 19.5v2M21.5 12h-2M4.5 12h-2m14.8-6.3-1.4 1.4M8.1 15.9l-1.4 1.4m12.6 0-1.4-1.4M8.1 8.1 6.7 6.7"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  shield:
    '<path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  sparkles:
    '<path d="M12 3v4m0 10v4m9-9h-4M7 12H3m13.5-6.5-2.1 2.1m-4.8 8.8-2.1 2.1m0-11 2.1 2.1m8.8 4.8-2.1-2.1"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14"/>',
  mouse: '<path d="M5 3 19 12l-6 1.2L11 19 5 3Z"/>',
  keyboard:
    '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  scroll:
    '<rect x="8" y="3" width="8" height="18" rx="4"/><path d="M12 7v3"/>',
  terminal:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  folder:
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  save: '<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 4v5h7M8 21v-7h8v7"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/>',
  trash:
    '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/>',
  file: '<path d="M14 3v4a1 1 0 0 0 1 1h4M5 3h9l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/>',
  monitor:
    '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  alert:
    '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/>',
  flag: '<path d="M4 15V3a1 1 0 0 1 1-1h13v4"/><path d="M4 22V4"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
} as const;

export type IconName = keyof typeof ICONS;

export const PROVIDER_GLYPHS: Record<string, string> = {
  claude: "✳",
  anthropic: "✳",
  openai: "◎",
  gemini: "◆",
  google: "◆",
  openrouter: "⌥",
  ollama: "⬡",
  lmstudio: "▦",
  default: "◈",
};

export function providerGlyph(providerType: string) {
  return PROVIDER_GLYPHS[providerType.toLowerCase()] ?? PROVIDER_GLYPHS.default;
}

export function statusDotClass(status: string) {
  if (status === "recording") return "recording";
  if (status === "processing") return "processing";
  if (status === "exported") return "exported";
  return "ready";
}

export function statusBadgeClass(status: string) {
  return statusDotClass(status);
}

export function exportTypeClass(format: string) {
  const normalized = format.toLowerCase().replace("markdown", "md");
  if (normalized === "pdf") return "pdf";
  if (normalized === "html") return "html";
  if (normalized === "video") return "video";
  return "md";
}

export function timelineIcon(eventType: string): IconName {
  if (eventType.includes("mouse")) return "mouse";
  if (eventType.includes("key")) return "keyboard";
  if (eventType.includes("scroll")) return "scroll";
  if (eventType.includes("terminal")) return "terminal";
  return "window";
}
