import type { CSSProperties } from "react";
import { ICONS, type IconName } from "@/lib/icons";

type IconProps = {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
};

export function Icon({ name, size = 18, style, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
