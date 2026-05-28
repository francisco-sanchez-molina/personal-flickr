/**
 * Slide-in drawer for mobile navigation + settings. Built on top of the
 * Sheet primitive (which itself wraps Radix Dialog), so it gets focus trap,
 * body scroll lock and ARIA semantics for free.
 */
import { MOODS, useThemePreferences } from "~/lib/theme";
import { Icons } from "../icons";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetItem,
  SheetSection,
  SheetTitle,
} from "../ui/Sheet";

interface Props {
  open: boolean;
  onClose: () => void;
  current?:
    | "home"
    | "photos"
    | "galleries"
    | "favorites"
    | "tags"
    | "map"
    | "other";
}

export default function MobileMenu({ open, onClose, current }: Props) {
  const { mood, theme, setMood, toggleTheme } = useThemePreferences();

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Menú</SheetTitle>
          <SheetClose asChild>
            <button className="iconbtn" aria-label="Cerrar">
              <Icons.Close size={16} />
            </button>
          </SheetClose>
        </SheetHeader>
        <SheetDescription>Navegación y ajustes de Personal Flickr</SheetDescription>

        <SheetSection>
          <SheetItem as="a" href="/" active={current === "home"}>
            <Icons.Home size={18} />
            <span>Inicio</span>
          </SheetItem>
          <SheetItem as="a" href="/?view=galleries" active={current === "galleries"}>
            <Icons.Folder size={18} />
            <span>Galerías</span>
          </SheetItem>
          <SheetItem as="a" href="/?view=photos" active={current === "photos"}>
            <Icons.Photos size={18} />
            <span>Fotos</span>
          </SheetItem>
          <SheetItem
            as="a"
            href="/?view=favorites"
            active={current === "favorites"}
          >
            <Icons.Heart size={18} />
            <span>Favoritas</span>
          </SheetItem>
          <SheetItem as="a" href="/?view=tags" active={current === "tags"}>
            <Icons.Tag size={18} />
            <span>Etiquetas</span>
          </SheetItem>
        </SheetSection>

        <SheetSection label="Mood">
          {MOODS.map((m) => (
            <SheetItem
              key={m.id}
              active={mood === m.id}
              onClick={() => setMood(m.id)}
              type="button"
            >
              <span
                className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-line-2"
                // Mood color is data-driven; can't be a Tailwind utility.
                style={{ background: m.color }}
                aria-hidden="true"
              />
              <span>{m.label}</span>
            </SheetItem>
          ))}
        </SheetSection>

        <SheetSection label="Tema">
          <SheetItem onClick={toggleTheme} type="button">
            {theme === "dark" ? <Icons.Sun size={18} /> : <Icons.Moon size={18} />}
            <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          </SheetItem>
        </SheetSection>

        <SheetSection>
          <form method="POST" action="/api/auth/logout" className="m-0">
            <SheetItem type="submit">
              <Icons.Close size={18} />
              <span>Salir</span>
            </SheetItem>
          </form>
        </SheetSection>
      </SheetContent>
    </Sheet>
  );
}
