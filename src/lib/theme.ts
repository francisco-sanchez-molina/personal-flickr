/**
 * Theme primitives — mood (accent palette) and theme (dark/light) selection.
 *
 * The actual style switching happens via two HTML attributes on `<html>`:
 *   data-mood="estudio" | "darkroom" | "salon"
 *   data-theme="dark" | "light"
 *
 * tokens.css matches on these attributes to flip the CSS variables.  The
 * initial values are applied by an inline `<script>` in Base.astro that runs
 * before React hydrates (so there's no flash). This hook just lets React
 * components read the current value and update it, keeping the DOM
 * attribute, localStorage, and React state in sync in one place.
 */
import { useEffect, useState } from "react";

export type Mood = "estudio" | "darkroom" | "salon";
export type Theme = "dark" | "light";

export interface MoodDescriptor {
  id: Mood;
  /** Short label for menus. */
  label: string;
  /** Verbose label for the desktop rail dropdown (`"Estudio · magenta"`). */
  longLabel: string;
  /** Representative swatch color for the mobile menu / dropdowns. */
  color: string;
}

export const MOODS: readonly MoodDescriptor[] = [
  { id: "estudio", label: "Estudio", longLabel: "Estudio · magenta", color: "#FF2D87" },
  { id: "darkroom", label: "Cuarto oscuro", longLabel: "Cuarto oscuro · ámbar", color: "#FF6A2C" },
  { id: "salon", label: "Salón", longLabel: "Salón · refinado", color: "#14120E" },
];

const STORAGE = {
  mood: "pf:mood",
  theme: "pf:theme",
} as const;

function readAttr<T extends string>(name: string, fallback: T): T {
  if (typeof document === "undefined") return fallback;
  return (document.documentElement.getAttribute(name) as T | null) ?? fallback;
}

function writeAttrAndStore(attr: string, key: string, value: string) {
  document.documentElement.setAttribute(attr, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / disabled storage — ignore */
  }
}

/**
 * Hook that exposes the current mood/theme and setters that update DOM +
 * localStorage atomically.  Both islands (Rail, MobileMenu) read from this so
 * the logic only lives here.
 *
 * The state is hydrated from the HTML attributes set by Base.astro's inline
 * script, not from localStorage directly — that way the React state always
 * matches what the user is actually seeing on screen.
 */
export function useThemePreferences(): {
  mood: Mood;
  theme: Theme;
  setMood: (m: Mood) => void;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
} {
  const [mood, setMoodState] = useState<Mood>("estudio");
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setMoodState(readAttr<Mood>("data-mood", "estudio"));
    setThemeState(readAttr<Theme>("data-theme", "dark"));
  }, []);

  const setMood = (m: Mood) => {
    setMoodState(m);
    writeAttrAndStore("data-mood", STORAGE.mood, m);
  };
  const setTheme = (t: Theme) => {
    setThemeState(t);
    writeAttrAndStore("data-theme", STORAGE.theme, t);
  };
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return { mood, theme, setMood, setTheme, toggleTheme };
}
