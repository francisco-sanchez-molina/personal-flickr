/**
 * Inline error message — small, monospaced, danger-tinted. Used after forms
 * and async actions where we want feedback close to the field/button. The
 * component returns null when there's no message so callers can do
 * `<ErrorText message={error} />` without wrapping in a conditional.
 */
import { cn } from "~/lib/cn";

interface Props {
  message: string | null | undefined;
  /** Extra spacing utilities, e.g. `"mt-2"`. */
  className?: string;
}

export default function ErrorText({ message, className }: Props) {
  if (!message) return null;
  return (
    <p className={cn("m-0 font-mono text-[12.5px] text-danger", className)}>
      {message}
    </p>
  );
}
