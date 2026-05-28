/**
 * Standard empty-state block used wherever a list has no items.
 *
 *   <EmptyState title="Aún no hay fotos." sub="Usa Subir fotos para empezar." />
 *
 * The .empty class lives in modules/misc.css and handles the visual
 * (centered serif title + muted sub). This component is just a thin wrapper
 * to stop callers from re-rendering the same `<div class="empty">…</div>`
 * markup at five different sites.
 */
import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  sub?: ReactNode;
}

export default function EmptyState({ title, sub }: Props) {
  return (
    <div className="empty">
      <div className="big serif">{title}</div>
      {sub && <div>{sub}</div>}
    </div>
  );
}
