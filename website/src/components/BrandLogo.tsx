type BrandLogoProps = {
  gradientId?: string;
};

export function BrandLogo({ gradientId = "mg" }: BrandLogoProps) {
  return (
    <svg className="ico" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#84f4cf" />
          <stop offset="1" stopColor="#2bcf97" />
        </linearGradient>
      </defs>
      <g
        stroke="#052b20"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M12 6 H6 V12" />
        <path d="M20 6 H26 V12" />
        <path d="M26 20 V26 H20" />
        <path d="M12 26 H6 V20" />
      </g>
      <path d="M13 12.5 L21 16 L13 19.5 Z" fill="#052b20" />
    </svg>
  );
}
