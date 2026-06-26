import Image from "next/image";

// Reusable AXION brand logo. Renders the logo image from /public/axion-logo.png.
// Drop the AXION artwork at public/axion-logo.png and it appears everywhere.
//
// Props:
//  - size: pixel height of the logo image (width auto-scales)
//  - withText: show the "AXION" wordmark + tagline next to the mark
//  - tagline: small text under AXION (default "Smart Trading & Analytics")
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
        alt="AXION"
        width={size}
        height={size}
        priority
        className="object-contain"
        style={{ height: size, width: "auto" }}
      />
      {withText && (
        <span className="leading-tight">
          <span className="block text-sm font-extrabold tracking-wide text-foreground">AXION</span>
          {tagline && (
            <span className="block text-[9px] font-medium uppercase tracking-[0.12em] text-muted">{tagline}</span>
          )}
        </span>
      )}
    </span>
  );
}
