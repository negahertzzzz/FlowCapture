import { convertFileSrc } from "@tauri-apps/api/core";

type SessionThumbnailProps = {
  path?: string | null;
};

export function SessionThumbnail({ path }: SessionThumbnailProps) {
  if (!path) {
    return <div className="sthumb" aria-hidden />;
  }

  return (
    <div className="sthumb sthumb-live">
      <img src={convertFileSrc(path)} alt="" loading="lazy" />
    </div>
  );
}
