export function Logo({
  size = 32,
  variant = "icon",
  className = "",
}: {
  size?: number;
  variant?: "icon" | "medium" | "full";
  className?: string;
}) {
  const iconSize = variant === "medium" || variant === "full" ? 28 : Math.round(size * 0.8);
  const textSize = variant === "icon" ? Math.round(size * 0.5) : variant === "medium" ? 16 : 20;
  const showBrand = variant !== "icon";

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} style={{ height: size }}>
      <span
        className="grid place-items-center rounded-md font-black text-white"
        style={{
          width: iconSize,
          height: iconSize,
          fontSize: Math.round(iconSize * 0.55),
          background: "linear-gradient(135deg, #00cc44, #0088cc)",
          flexShrink: 0,
        }}
      >
        A
      </span>
      {showBrand && (
        <span className="font-extrabold tracking-tight" style={{ fontSize: textSize, color: "#04122A" }}>
          AXION
        </span>
      )}
    </span>
  );
}
