/** SVG icon set adapted from the design handoff. Single-stroke, 24×24 base. */
import type { SVGProps, ReactNode } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "stroke"> & {
  size?: number;
  stroke?: number;
};

function S({
  children,
  size = 18,
  stroke = 1.6,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icons = {
  Logo: ({ size = 18 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="8" cy="12" r="5" />
      <circle cx="16" cy="12" r="5" opacity=".55" />
    </svg>
  ),
  Search: (p: IconProps) => (
    <S {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </S>
  ),
  Grid: (p: IconProps) => (
    <S {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </S>
  ),
  Photos: (p: IconProps) => (
    <S {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="m3 17 5-5 4 4 3-3 6 6" />
    </S>
  ),
  Star: (p: IconProps) => (
    <S {...p}>
      <path d="m12 3 2.6 5.8L21 9.6l-4.7 4.3 1.3 6.4L12 17l-5.6 3.2 1.3-6.4L3 9.6l6.4-.8L12 3z" />
    </S>
  ),
  StarFill: (p: IconProps) => (
    <svg
      width={p.size ?? 18}
      height={p.size ?? 18}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="m12 3 2.6 5.8L21 9.6l-4.7 4.3 1.3 6.4L12 17l-5.6 3.2 1.3-6.4L3 9.6l6.4-.8L12 3z" />
    </svg>
  ),
  Plus: (p: IconProps) => (
    <S {...p}>
      <path d="M12 5v14M5 12h14" />
    </S>
  ),
  Upload: (p: IconProps) => (
    <S {...p}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 20h16" />
    </S>
  ),
  Download: (p: IconProps) => (
    <S {...p}>
      <path d="M12 4v12M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </S>
  ),
  Close: (p: IconProps) => (
    <S {...p}>
      <path d="M5 5l14 14M19 5 5 19" />
    </S>
  ),
  ChevL: (p: IconProps) => (
    <S {...p}>
      <path d="m15 6-6 6 6 6" />
    </S>
  ),
  ChevR: (p: IconProps) => (
    <S {...p}>
      <path d="m9 6 6 6-6 6" />
    </S>
  ),
  Sun: (p: IconProps) => (
    <S {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" />
    </S>
  ),
  Moon: (p: IconProps) => (
    <S {...p}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </S>
  ),
  Sliders: (p: IconProps) => (
    <S {...p}>
      <path d="M4 6h11M4 12h7M4 18h13" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="14" cy="12" r="2" />
      <circle cx="21" cy="18" r="2" />
    </S>
  ),
  More: (p: IconProps) => (
    <S {...p}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </S>
  ),
  Trash: (p: IconProps) => (
    <S {...p}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </S>
  ),
  Info: (p: IconProps) => (
    <S {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </S>
  ),
  Folder: (p: IconProps) => (
    <S {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </S>
  ),
  Play: (p: IconProps) => (
    <S {...p}>
      <path d="M7 4v16l13-8L7 4z" />
    </S>
  ),
  Share: (p: IconProps) => (
    <S {...p}>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8 11 8-4M8 13l8 4" />
    </S>
  ),
  Copy: (p: IconProps) => (
    <S {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </S>
  ),
  Map: (p: IconProps) => (
    <S {...p}>
      <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="2.5" />
    </S>
  ),
  Compare: (p: IconProps) => (
    <S {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
      <path d="m9 9-2 3 2 3M15 9l2 3-2 3" />
    </S>
  ),
  Reset: (p: IconProps) => (
    <S {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </S>
  ),
  Check: (p: IconProps) => (
    <S {...p} stroke={2.4}>
      <path d="m5 12 5 5 9-11" />
    </S>
  ),
  Home: (p: IconProps) => (
    <S {...p}>
      <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z" />
    </S>
  ),
  Heart: (p: IconProps) => (
    <S {...p}>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.7A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
    </S>
  ),
  Menu: (p: IconProps) => (
    <S {...p}>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </S>
  ),
  Tag: (p: IconProps) => (
    <S {...p}>
      <path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" />
      <circle cx="8" cy="8" r="1.5" />
    </S>
  ),
  RotL: (p: IconProps) => (
    <S {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </S>
  ),
  RotR: (p: IconProps) => (
    <S {...p}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </S>
  ),
  Fullscreen: (p: IconProps) => (
    <S {...p}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </S>
  ),
  FullscreenExit: (p: IconProps) => (
    <S {...p}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </S>
  ),
};
