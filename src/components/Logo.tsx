import Image from "next/image";

const VARIANTS = {
  icon: { file: "/branding/nepse-axion-logo-icon.png", w: 683, h: 619 },
  medium: { file: "/branding/nepse-axion-logo-medium.png", w: 1133, h: 778 },
  full: { file: "/branding/nepse-axion-logo-full.png", w: 1134, h: 839 },
} as const;

export function Logo({
  size = 32,
  variant = "icon",
  className = "",
}: {
  size?: number;
  variant?: "icon" | "medium" | "full";
  className?: string;
}) {
  const v = VARIANTS[variant];
  return (
    <Image
      src={v.file}
      alt="NEPSE AXION"
      width={v.w}
      height={v.h}
      priority
      className={`object-contain ${className}`}
      style={{ height: size, width: "auto" }}
    />
  );
}
