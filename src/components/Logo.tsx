import Image from "next/image";

// Reusable NEPSE AXION brand logo.
// Drop the NEPSE AXION artwork at public/nepse-axion-logo.png and it appears everywhere.
//
// Props:
//  - size: pixel height of the logo image (width auto-scales)
//  - withText: show the "NEPSE AXION" wordmark + tagline next to the mark
//  - tagline: small text under NEPSE AXION (default "Smart Trading & Analytics")
export function Logo({
  size = 32,
  withText = false,
  tagline = "Smart Trading & Analytics",
  className = "",
}: {
  size?: number;
  withText?: boolean;
  tagline?: string;
  className?: string;
}) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/axion-logo.svg"
        alt="NEPSE AXION"
        width={size}
        height={size}
        priority
        className="object-contain"
        style={{ height: size, width: "auto" }}
      />
      {withText && (
        <span className="leading-tight">
          <span className="block text-sm font-extrabold tracking-wide text-foreground">NEPSE AXION</span>
          {tagline && (
            <span className="block text-[9px] font-medium uppercase tracking-[0.12em] text-muted">{tagline}</span>
          )}
        </span>
      )}
    </span>
  );
}
