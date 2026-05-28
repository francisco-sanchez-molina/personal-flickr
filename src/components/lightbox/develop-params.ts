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
  rotate: 0 | 90 | 180 | 270;
}

export const DEFAULT_DEVELOP: DevelopParams = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  rotate: 0,
};

/** Build the equivalent CSS filter string so the preview matches the server render. */
export function paramsToCSSFilter(p: DevelopParams): string {
  const parts: string[] = [];
  if (p.brightness !== 1) parts.push(`brightness(${p.brightness})`);
  if (p.contrast !== 1) parts.push(`contrast(${p.contrast})`);
  if (p.saturation !== 1) parts.push(`saturate(${p.saturation})`);
  if (p.hue !== 0) parts.push(`hue-rotate(${p.hue}deg)`);
  return parts.join(" ");
}

export function paramsToCSSTransform(p: DevelopParams): string {
  return p.rotate ? `rotate(${p.rotate}deg)` : "";
}
