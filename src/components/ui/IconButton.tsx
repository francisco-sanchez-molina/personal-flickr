/**
 * IconButton — the `.iconbtn` CSS class wrapped so callers don't repeat
 * the className + `aria-label` discipline at every site.
 *
 *   <IconButton aria-label="Cerrar" onClick={...}>
 *     <Icons.Close size={15} />
 *   </IconButton>
 *
 * `aria-label` is required by the prop signature — these buttons render
 * only an icon, so without a label they're invisible to screen readers.
 * TypeScript enforces it at the call site.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "~/lib/cn";

interface Props extends Omit<ComponentPropsWithoutRef<"button">, "aria-label"> {
  /** Required so the button is announced to assistive tech. */
  "aria-label": string;
  /**
   * Visual active state — adds `.active` to the class list.
   * For toggle semantics, also pass `aria-pressed` so screen readers
   * announce the state. `active` doesn't auto-emit it because some
   * callsites use `.active` purely as a highlight (no toggle).
   */
  active?: boolean;
  /** Extra utility classes appended after the base. */
  className?: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  function IconButton(
    { active = false, className, children, type, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn("iconbtn", active && "active", className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

export default IconButton;
