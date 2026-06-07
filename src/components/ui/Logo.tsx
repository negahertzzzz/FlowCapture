type LogoProps = {
  size?: number;
  className?: string;
  /** Kept for compatibility; all variants use the same mark. */
  variant?: "brand" | "accent";
};

export function Logo({ size = 40, className }: LogoProps) {
  return (
    <img
      src="/logo.png"
      alt=""
      className={className}
      width={size}
      height={size}
      style={{
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}
