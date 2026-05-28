/**
 * Spinner — small inline loading indicator. Same visual language as
 * the `.spinner` CSS class in masonry.css (used on processing video
 * tiles) but as a React component for ad-hoc inline use ("Guardando…",
 * button loading state, etc.).
 *
 *   <Spinner />               // 14px, ink-3 color
 *   <Spinner size={20} />     // larger
 *
 * Respects `prefers-reduced-motion` via the global CSS rule in
 * `modules/base.css` (animation-duration → 0.001ms).
 */
import { cn } from "~/lib/cn";

interface Props {
  /** Diameter in pixels. */
  size?: number;
  className?: string;
  /** Stroke / track color override. Defaults to currentColor for inheritance. */
  color?: string;
}

export default function Spinner({ size = 14, className, color }: Props) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cn("inline-block align-middle", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${color ? `${color}33` : "rgba(255,255,255,0.18)"}`,
        borderTopColor: color ?? "currentColor",
        animation: "spinner-rotate 0.8s linear infinite",
      }}
    />
  );
}
