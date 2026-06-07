import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/lib/icons";

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "ghost";
  size?: "sm" | "md";
  icon?: IconName;
  children?: ReactNode;
  style?: CSSProperties;
};

export function AppButton({
  kind = "ghost",
  size = "md",
  icon,
  children,
  className,
  style,
  ...props
}: AppButtonProps) {
  const classes = [
    "btn",
    kind === "primary" ? "btn-primary" : "btn-ghost",
    size === "sm" ? "btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} style={style} {...props}>
      {icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children}
    </button>
  );
}
