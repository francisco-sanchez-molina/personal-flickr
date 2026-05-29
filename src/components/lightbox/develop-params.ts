/**
 * Tiny module split out from DevelopPanel.tsx so consumers can keep their
 * "default params / parse state" wiring synchronous even when the panel
 * itself is lazy-loaded.
 *
 * The shape mirrors what the server persists on `photo.develop_params`;
 * see `lib/processor.ts` for the canonical server-side version.
 */
export interface DevelopParams {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  /**
   * Warm/vintage tone, 0 = neutral … 1 = full sepia. Previews via CSS
   * `sepia()` and renders via sharp `.recomb()` with the *same*
   * interpolated matrix, so the live preview matches the saved file
   * pixel-for-pixel (see processor.ts `sepiaMatrix`).
   */
  warmth: number;
  rotate: 0 | 90 | 180 | 270;
}

export const DEFAULT_DEVELOP: DevelopParams = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  warmth: 0,
  rotate: 0,
};

/** Build the equivalent CSS filter string so the preview matches the server render. */
export function paramsToCSSFilter(p: DevelopParams): string {
  const parts: string[] = [];
  if (p.brightness !== 1) parts.push(`brightness(${p.brightness})`);
  if (p.contrast !== 1) parts.push(`contrast(${p.contrast})`);
  if (p.saturation !== 1) parts.push(`saturate(${p.saturation})`);
  if (p.hue !== 0) parts.push(`hue-rotate(${p.hue}deg)`);
  // Append last so the order matches the sharp pipeline (recomb runs
  // after modulate). CSS sepia uses the canonical matrix we replicate.
  // Truthy check also guards legacy params where warmth is undefined.
  if (p.warmth) parts.push(`sepia(${p.warmth})`);
  return parts.join(" ");
}

export function paramsToCSSTransform(p: DevelopParams): string {
  return p.rotate ? `rotate(${p.rotate}deg)` : "";
}
