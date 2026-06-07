type BrandLogoProps = {
  className?: string;
};

export function BrandLogo({ className = "ico" }: BrandLogoProps) {
  return (
    <img
      src="/logo.png"
      alt=""
      className={className}
      width={30}
      height={30}
      style={{ objectFit: "contain", display: "block" }}
    />
  );
}
