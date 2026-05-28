/**
 * Button — type-safe wrapper around the `.btn` CSS class system.
 *
 *   <Button>Default</Button>
 *   <Button variant="primary">Save</Button>
 *   <Button variant="ghost" size="sm">Cancel</Button>
 *   <Button variant="danger">Delete</Button>
 *   <Button loading>Saving…</Button>
 *   <Button href="/login">Sign in</Button>  ← renders <a>
 *
 * Why a wrapper around CSS classes instead of CSS-in-JS or Tailwind-only?
 * The CSS lives in `modules/topbar.css` (`.btn` and friends) and powers
 * legacy call-sites that still use plain `className="btn primary"`. The
 * component just gives us type-checked variants + the auto-`<a>` /
 * loading affordances on top.
 */
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "~/lib/cn";
import Spinner from "./Spinner";

type Variant = "default" | "primary" | "ghost" | "danger";
type Size = "default" | "sm";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  /** Show a spinner + disable. Label keeps its width to avoid layout jump. */
  loading?: boolean;
  /** Extra utility classes appended after the base/variant ones. */
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps | "href"> & {
    href?: undefined;
  };

type ButtonAsAnchor = CommonProps &
  Omit<ComponentPropsWithoutRef<"a">, keyof CommonProps> & {
    /** When set, renders an <a> with `.btn` styling. */
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

function classes(variant: Variant, size: Size, extra?: string): string {
  return cn(
    "btn",
    variant === "primary" && "primary",
    variant === "ghost" && "ghost",
    variant === "danger" && "danger",
    size === "sm" && "sm",
    extra,
  );
}

/**
 * forwardRef typed to support either a button or an anchor render —
 * Radix's `asChild` pattern is more flexible but adds a peer dep
 * surface here for no gain (we only ever swap to <a>).
 */
export const Button = forwardRef<HTMLElement, ButtonProps>(function Button(
  props,
  ref,
) {
  const {
    variant = "default",
    size = "default",
    loading = false,
    className,
    children,
    ...rest
  } = props;

  const finalClass = classes(variant, size, className);

  if ("href" in rest && rest.href !== undefined) {
    return (
      <a
        ref={ref as React.Ref<HTMLAnchorElement>}
        className={finalClass}
        {...(rest as ComponentPropsWithoutRef<"a">)}
      >
        {loading ? <Spinner size={12} /> : null}
        {children}
      </a>
    );
  }

  const buttonRest = rest as ComponentPropsWithoutRef<"button">;
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={buttonRest.type ?? "button"}
      className={finalClass}
      disabled={loading || buttonRest.disabled}
      {...buttonRest}
    >
      {loading ? <Spinner size={12} /> : null}
      {children}
    </button>
  );
});

export default Button;
