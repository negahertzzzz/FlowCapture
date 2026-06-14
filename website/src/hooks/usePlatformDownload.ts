import { useMemo } from "react";
import { detectPlatform, getPlatformDownload } from "../lib/platform";

export function usePlatformDownload() {
  return useMemo(() => getPlatformDownload(detectPlatform()), []);
}
