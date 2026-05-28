/**
 * Section header — the eyebrow + title + optional right-aligned actions
 * combo used everywhere on the home page and in galleries.  Wraps the
 * `.section-head` CSS class (which already handles the flex/space-between
 * layout) so callers don't repeat the same nested markup.
 *
 *   <SectionHead
 *     eyebrow="Subidas recientes"
 *     title="Últimas fotos"
 *     actions={<span className="count-chip">12</span>}
 *   />
 */
import type { ReactNode } from "react";

interface Props {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Right-side content (count chips, buttons, etc.). */
  actions?: ReactNode;
}

export default function SectionHead({ eyebrow, title, actions }: Props) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <div className="h-eyebrow mb-2">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {actions}
    </div>
  );
}
