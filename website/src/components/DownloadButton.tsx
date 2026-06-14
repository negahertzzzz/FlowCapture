import { usePlatformDownload } from "../hooks/usePlatformDownload";

type DownloadButtonProps = {
  className?: string;
  label?: string;
  showIcon?: boolean;
};

export function DownloadButton({
  className = "btn btn-primary",
  label,
  showIcon = true,
}: DownloadButtonProps) {
  const download = usePlatformDownload();
  const text = label ?? download.label;

  return (
    <a
      className={className}
      href={download.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {showIcon ? <PlatformIcon platform={download.platform} /> : null}
      {text}
    </a>
  );
}

function PlatformIcon({ platform }: { platform: "macos" | "windows" | "linux" }) {
  if (platform === "windows") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 5.5 10.5 4.5V11H3V5.5Zm7.5 7L3 18.4V12.5h7.5Zm1-7.3L21 2.5V11h-9.5V5.2ZM21 12.5V21.5l-9.5-1.7V12.5H21Z" />
      </svg>
    );
  }

  if (platform === "linux") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.36 12.6c-.02-2.06 1.68-3.05 1.76-3.1-.96-1.4-2.46-1.6-2.99-1.62-1.27-.13-2.48.75-3.13.75-.64 0-1.64-.73-2.7-.71-1.39.02-2.67.81-3.38 2.05-1.44 2.5-.37 6.2 1.04 8.23.69.99 1.51 2.1 2.59 2.06 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.6.67 2.7.65 1.11-.02 1.82-1.01 2.5-2.01.79-1.15 1.11-2.27 1.13-2.33-.02-.01-2.17-.83-2.2-3.3Zm-2.06-6.06c.57-.69.95-1.65.85-2.61-.82.03-1.81.55-2.4 1.23-.52.61-.98 1.58-.86 2.51.91.07 1.84-.46 2.41-1.13Z" />
    </svg>
  );
}
