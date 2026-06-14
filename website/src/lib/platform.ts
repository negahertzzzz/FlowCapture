import { GITHUB_REPO_URL, MACOS_DMG_URL, WINDOWS_EXE_URL } from "./site";

export type Platform = "macos" | "windows" | "linux";

export type PlatformDownload = {
  platform: Platform;
  href: string;
  label: string;
  note: string;
  shortNote: string;
  external: boolean;
};

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "macos";

  const ua = navigator.userAgent;
  if (/Win/i.test(ua)) return "windows";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "macos";
}

export function getPlatformDownload(platform: Platform): PlatformDownload {
  switch (platform) {
    case "windows":
      return {
        platform,
        href: WINDOWS_EXE_URL,
        label: "Download for Windows",
        note: "Windows · x64 · v0.1.0 · free forever",
        shortNote: "Windows · x64 · v0.1.0",
        external: true,
      };
    case "linux":
      return {
        platform,
        href: GITHUB_REPO_URL,
        label: "Build from Source",
        note: "Linux · build from source · v0.1.0 · free forever",
        shortNote: "Linux · build from source · v0.1.0",
        external: true,
      };
    default:
      return {
        platform: "macos",
        href: MACOS_DMG_URL,
        label: "Download for macOS",
        note: "macOS · Apple Silicon · v0.1.0 · free forever",
        shortNote: "macOS · Apple Silicon · v0.1.0",
        external: true,
      };
  }
}
