/**
 * Tiny class-name composer.  Re-exports `clsx` under the more conventional
 * name `cn` so call sites read closer to template strings:
 *
 *   <div className={cn("tile", isSelected && "selected", dim && "dim")} />
 *
 * Accepts strings, falsy values (skipped), and arrays/objects per clsx's
 * own rules. Pure pass-through — there's no Tailwind-merging here because
 * the app doesn't use Tailwind.
 */
export { clsx as cn } from "clsx";
