/**
 * Compartir — dialog para crear y revocar enlaces públicos de una foto o
 * una galería. Cada enlace es un token de 22 caracteres (16 bytes random)
 * que concede acceso de sólo lectura sin login.
 *
 *   <ShareDialog kind="photo"   id={photo.id}   open … />  // /s/:token
 *   <ShareDialog kind="gallery" id={gallery.id} open … />  // /sg/:token
 *
 * Endpoints por tipo:
 *   photo   → /api/photos/:id/shares     · revoke /api/shares/:token
 *   gallery → /api/galleries/:id/shares  · revoke /api/gallery-shares/:token
 */
import { useEffect, useState } from "react";
import { Icons } from "../icons";
import Button from "../ui/Button";
import { useConfirm } from "../ui/ConfirmDialog";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import ErrorText from "../ui/ErrorText";
import IconButton from "../ui/IconButton";

interface ShareRow {
  token: string;
  created_at: number;
  view_count: number;
}

type ShareKind = "photo" | "gallery";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ShareKind;
  id: number;
}

const COPY = {
  photo: {
    title: "Compartir foto",
    desc: "Enlaces públicos a esta foto. Cualquiera con la URL podrá verla sin iniciar sesión hasta que la revoques",
    noun: "la foto",
    listEndpoint: (id: number) => `/api/photos/${id}/shares`,
    revokeEndpoint: (token: string) => `/api/shares/${token}`,
    urlPrefix: "/s/",
  },
  gallery: {
    title: "Compartir galería",
    desc: "Enlaces públicos a esta galería. Cualquiera con la URL podrá ver todas sus fotos sin iniciar sesión hasta que lo revoques",
    noun: "la galería",
    listEndpoint: (id: number) => `/api/galleries/${id}/shares`,
    revokeEndpoint: (token: string) => `/api/gallery-shares/${token}`,
    urlPrefix: "/sg/",
  },
} as const;

function fmtCreated(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ShareDialog({ open, onOpenChange, kind, id }: Props) {
  const c = COPY[kind];
  const shareUrlFor = (token: string) =>
    typeof window === "undefined"
      ? `${c.urlPrefix}${token}`
      : `${window.location.origin}${c.urlPrefix}${token}`;

  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Token last copied — drives the transient "Copiado ✓" badge. */
  const [copied, setCopied] = useState<string | null>(null);
  const confirm = useConfirm();

  // Reload on each open so the list reflects creations / revocations
  // made elsewhere (e.g. another tab) since the last time this dialog
  // was visible.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(c.listEndpoint(id))
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setShares(body.shares ?? []);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, id, c]);

  // Clear the "Copiado ✓" badge after a couple of seconds.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(c.listEndpoint(id), { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      const share = body.share as ShareRow;
      setShares((arr) => [share, ...arr]);
      // Convenience: copy the new URL straight away.
      await copyToClipboard(shareUrlFor(share.token));
      setCopied(share.token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (share: ShareRow) => {
    const ok = await confirm({
      title: "¿Revocar este enlace?",
      description: `Cualquiera que tenga la URL dejará de poder ver ${c.noun}.`,
      confirmLabel: "Revocar",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      const res = await fetch(c.revokeEndpoint(share.token), {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? "error");
      }
      setShares((arr) => arr.filter((s) => s.token !== share.token));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const copy = async (share: ShareRow) => {
    try {
      await copyToClipboard(shareUrlFor(share.token));
      setCopied(share.token);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
          <DialogClose asChild>
            <IconButton aria-label="Cerrar">
              <Icons.Close size={15} />
            </IconButton>
          </DialogClose>
        </DialogHeader>
        <DialogDescription>{c.desc}</DialogDescription>

        <DialogBody>
          <div className="grid gap-2">
            {loading ? (
              <p className="m-0 px-1 py-3 text-[13px] text-ink-3">
                cargando enlaces…
              </p>
            ) : shares.length === 0 ? (
              <p className="m-0 px-1 py-3 text-[13px] text-ink-3">
                Aún no hay enlaces. Crea el primero ↓
              </p>
            ) : (
              shares.map((s) => (
                <div
                  key={s.token}
                  className="flex items-center gap-2 rounded-md border border-line bg-bg-2 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="overflow-hidden font-mono text-[12px] text-ellipsis whitespace-nowrap text-ink-2">
                      {shareUrlFor(s.token)}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[10.5px] tracking-[.04em] text-ink-3">
                      <span>creado · {fmtCreated(s.created_at)}</span>
                      <span>
                        <span className="text-ink-2">{s.view_count}</span>{" "}
                        vista{s.view_count === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <IconButton
                    onClick={() => copy(s)}
                    aria-label="Copiar URL"
                    title={copied === s.token ? "Copiado ✓" : "Copiar"}
                  >
                    {copied === s.token ? (
                      <Icons.Check size={14} />
                    ) : (
                      <Icons.Copy size={14} />
                    )}
                  </IconButton>
                  <IconButton
                    onClick={() => revoke(s)}
                    aria-label="Revocar enlace"
                    title="Revocar"
                  >
                    <Icons.Trash size={14} />
                  </IconButton>
                </div>
              ))
            )}
          </div>

          <ErrorText message={error} className="mt-3" />
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cerrar</Button>
          </DialogClose>
          <Button variant="primary" onClick={create} loading={creating}>
            <Icons.Plus size={13} /> Nuevo enlace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function copyToClipboard(text: string): Promise<void> {
  // navigator.clipboard is unavailable on http (non-localhost) origins.
  // Fall back to an off-screen textarea + execCommand("copy") so the
  // feature works on Cloudflare-Tunnel previews and LAN devices that
  // hit the box via IP without HTTPS.
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText &&
    window.isSecureContext
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  document.body.appendChild(ta);
  ta.select();
  try {
    // execCommand is officially deprecated but it's the only path that
    // works for clipboard writes on non-secure origins (plain http LAN
    // / Cloudflare tunnel previews). The MDN spec hasn't proposed a
    // replacement for that case yet — keep until it is.
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}
