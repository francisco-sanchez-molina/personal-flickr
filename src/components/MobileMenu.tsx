/**
 * Slide-in drawer for mobile navigation + settings. Built on top of the
 * Sheet primitive (which itself wraps Radix Dialog), so it gets focus trap,
 * body scroll lock and ARIA semantics for free.
 */
import { useEffect, useState } from "react";
import { Icons } from "./icons";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetItem,
  SheetSection,
  SheetTitle,
} from "./ui/Sheet";

type Mood = "estudio" | "darkroom" | "salon";
type Theme = "dark" | "light";

const MOODS: { id: Mood; label: string; color: string }[] = [
  { id: "estudio", label: "Estudio", color: "#FF2D87" },
  { id: "darkroom", label: "Cuarto oscuro", color: "#FF6A2C" },
  { id: "salon", label: "Salón", color: "#14120E" },
];

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
  const [mood, setMood] = useState<Mood>("estudio");
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    if (!open) return;
    const m =
      (document.documentElement.getAttribute("data-mood") as Mood | null) ??
      "estudio";
    const t =
      (document.documentElement.getAttribute("data-theme") as Theme | null) ??
      "dark";
    setMood(m);
    setTheme(t);
  }, [open]);

  const applyMood = (m: Mood) => {
    setMood(m);
    document.documentElement.setAttribute("data-mood", m);
    try {
      localStorage.setItem("pf:mood", m);
    } catch {
      /* ignore */
    }
  };
  const applyTheme = (t: Theme) => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("pf:theme", t);
    } catch {
      /* ignore */
    }
  };

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
          <SheetItem as="a" href="/" active={current === "galleries"}>
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
              onClick={() => applyMood(m.id)}
              type="button"
            >
              <span
                style={{
                  display: "inline-block",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: m.color,
                  border: "1px solid var(--line-2)",
                  flexShrink: 0,
                }}
                aria-hidden="true"
              />
              <span>{m.label}</span>
            </SheetItem>
          ))}
        </SheetSection>

        <SheetSection label="Tema">
          <SheetItem
            onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
            type="button"
          >
            {theme === "dark" ? <Icons.Sun size={18} /> : <Icons.Moon size={18} />}
            <span>{theme === "dark" ? "Modo claro" : "Modo oscuro"}</span>
          </SheetItem>
        </SheetSection>

        <SheetSection>
          <form
            method="POST"
            action="/api/auth/logout"
            style={{ margin: 0 }}
          >
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
