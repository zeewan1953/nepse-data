function relLuminance(hex: string): number {
  const c = hex.replace("#", "").match(/.{2}/g)!.map((h) => parseInt(h, 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relLuminance(hex1);
  const l2 = relLuminance(hex2);
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

export const NAVY_WORDMARK = "#04122A";
export const HEADER_BG = "#FFFFFF"; // AppHeader background is white

export function needsBackingChip(
  foreground: string,
  background: string,
  threshold = 4.5,
): boolean {
  return contrastRatio(foreground, background) < threshold;
}
