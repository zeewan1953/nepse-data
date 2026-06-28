export function Logo({
  size = 32,
  variant = "medium",
  className = "",
}: {
  size?: number;
  variant?: "icon" | "medium" | "full";
  className?: string;
}) {
  const iconSize = variant === "icon" ? Math.round(size * 0.65) : Math.round(size * 0.7);
  const textSize = variant === "icon" ? Math.round(size * 0.45) : variant === "medium" ? Math.round(size * 0.42) : Math.round(size * 0.5);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} style={{ height: size }}>
      <span
        className="grid place-items-center rounded-md font-black text-white shrink-0"
        style={{
          width: iconSize,
          height: iconSize,
          fontSize: Math.round(iconSize * 0.55),
          background: "linear-gradient(135deg, #00cc44, #0088cc)",
        }}
      >
        A
      </span>
      <span className="font-extrabold tracking-tight leading-none" style={{ fontSize: textSize, color: "#04122A" }}>
        NEPSE AXION
      </span>
    </span>
  );
}
