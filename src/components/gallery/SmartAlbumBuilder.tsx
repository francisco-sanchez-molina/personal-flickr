/**
 * Dialog used to create / edit a smart album. Exposes the same filter
 * dimensions the server understands (see `SmartFilter` in lib/db.ts);
 * everything's optional so an empty form matches all photos.
 *
 * The form is intentionally flat — no tabs, no advanced/basic split.
 * For 8 fields the cost of "find the right tab" beats the cost of
 * scrolling a few rows.
 */
import { useEffect, useState } from "react";
import { Icons } from "../icons";
import Button from "../ui/Button";
import CheckboxRow from "../ui/CheckboxRow";
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
import TextField from "../ui/TextField";

export interface SmartFilter {
  camera?: string;
  lens?: string;
  kind?: "photo" | "video";
  isFavorite?: boolean;
  withoutGallery?: boolean;
  galleryId?: number;
  isoMin?: number;
  isoMax?: number;
  fstopMin?: number;
  fstopMax?: number;
  takenFrom?: number; // unix ms
  takenTo?: number; // unix ms
}

interface SmartAlbum {
  id: number;
  name: string;
  filter: SmartFilter;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog acts in edit mode and PATCHes this album. */
  editing?: SmartAlbum;
  onSaved: (album: SmartAlbum) => void;
}

// ──────────────── date helpers ────────────────

function msToDateInput(ms: number | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  // input[type=date] wants `yyyy-MM-dd` in the user's local timezone.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateInputToMs(s: string, endOfDay = false): number | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime()
    : new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

// ──────────────── form state helpers ────────────────

interface FormState {
  name: string;
  camera: string;
  lens: string;
  kind: "" | "photo" | "video";
  isFavorite: boolean;
  withoutGallery: boolean;
  isoMin: string;
  isoMax: string;
  fstopMin: string;
  fstopMax: string;
  takenFrom: string;
  takenTo: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    camera: "",
    lens: "",
    kind: "",
    isFavorite: false,
    withoutGallery: false,
    isoMin: "",
    isoMax: "",
    fstopMin: "",
    fstopMax: "",
    takenFrom: "",
    takenTo: "",
  };
}

function fromAlbum(album: SmartAlbum): FormState {
  const f = album.filter;
  return {
    name: album.name,
    camera: f.camera ?? "",
    lens: f.lens ?? "",
    kind: f.kind ?? "",
    isFavorite: f.isFavorite === true,
    withoutGallery: f.withoutGallery === true,
    isoMin: f.isoMin != null ? String(f.isoMin) : "",
    isoMax: f.isoMax != null ? String(f.isoMax) : "",
    fstopMin: f.fstopMin != null ? String(f.fstopMin) : "",
    fstopMax: f.fstopMax != null ? String(f.fstopMax) : "",
    takenFrom: msToDateInput(f.takenFrom),
    takenTo: msToDateInput(f.takenTo),
  };
}

function toFilter(form: FormState): SmartFilter {
  const out: SmartFilter = {};
  if (form.camera.trim()) out.camera = form.camera.trim();
  if (form.lens.trim()) out.lens = form.lens.trim();
  if (form.kind === "photo" || form.kind === "video") out.kind = form.kind;
  if (form.isFavorite) out.isFavorite = true;
  if (form.withoutGallery) out.withoutGallery = true;
  const isoMin = Number(form.isoMin);
  if (form.isoMin && Number.isFinite(isoMin)) out.isoMin = isoMin;
  const isoMax = Number(form.isoMax);
  if (form.isoMax && Number.isFinite(isoMax)) out.isoMax = isoMax;
  const fstopMin = Number(form.fstopMin);
  if (form.fstopMin && Number.isFinite(fstopMin)) out.fstopMin = fstopMin;
  const fstopMax = Number(form.fstopMax);
  if (form.fstopMax && Number.isFinite(fstopMax)) out.fstopMax = fstopMax;
  const tf = dateInputToMs(form.takenFrom);
  if (tf != null) out.takenFrom = tf;
  const tt = dateInputToMs(form.takenTo, true);
  if (tt != null) out.takenTo = tt;
  return out;
}

// ──────────────── component ────────────────

export default function SmartAlbumBuilder({
  open,
  onOpenChange,
  editing,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the form whenever the dialog opens (lets the "Edit" button rehydrate
  // the inputs from the album we're editing).
  useEffect(() => {
    if (!open) return;
    setForm(editing ? fromAlbum(editing) : emptyForm());
    setError(null);
  }, [open, editing]);

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("El nombre es obligatorio.");
      return;
    }
    setBusy(true);
    setError(null);
    const filter = toFilter(form);
    try {
      const res = editing
        ? await fetch(`/api/smart-albums/${editing.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, filter }),
          })
        : await fetch("/api/smart-albums", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, filter }),
          });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? body.error ?? "error");
      onSaved(body.album);
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar smart album" : "Nuevo smart album"}
          </DialogTitle>
          <DialogClose asChild>
            <IconButton aria-label="Cerrar">
              <Icons.Close size={15} />
            </IconButton>
          </DialogClose>
        </DialogHeader>
        <DialogDescription>
          Filtro guardado. Las fotos que coincidan aparecen agrupadas — la
          lista se recalcula en cada visita
        </DialogDescription>
        <DialogBody>
          <form
            id="smart-form"
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Row label="Nombre">
              <TextField
                autoFocus
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={80}
                placeholder='ej. "ISO alto sin galería"'
              />
            </Row>

            <Row label="Cámara">
              <TextField
                value={form.camera}
                onChange={(e) => set("camera", e.target.value)}
                maxLength={80}
                placeholder="ej. Canon EOS RP"
              />
            </Row>

            <Row label="Objetivo">
              <TextField
                value={form.lens}
                onChange={(e) => set("lens", e.target.value)}
                maxLength={120}
                placeholder="ej. RF 50mm F1.8"
              />
            </Row>

            <Row label="Tipo">
              <div className="flex gap-1.5">
                {(["", "photo", "video"] as const).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={form.kind === k ? "primary" : "ghost"}
                    onClick={() => set("kind", k)}
                  >
                    {k === "" ? "Cualquiera" : k === "photo" ? "Foto" : "Vídeo"}
                  </Button>
                ))}
              </div>
            </Row>

            <Row label="ISO">
              <RangePair
                from={form.isoMin}
                to={form.isoMax}
                onFromChange={(v) => set("isoMin", v)}
                onToChange={(v) => set("isoMax", v)}
                placeholderFrom="mín"
                placeholderTo="máx"
                type="number"
              />
            </Row>

            <Row label="Apertura">
              <RangePair
                from={form.fstopMin}
                to={form.fstopMax}
                onFromChange={(v) => set("fstopMin", v)}
                onToChange={(v) => set("fstopMax", v)}
                placeholderFrom="ƒ mín"
                placeholderTo="ƒ máx"
                type="number"
                step={0.1}
              />
            </Row>

            <Row label="Capturado">
              <RangePair
                from={form.takenFrom}
                to={form.takenTo}
                onFromChange={(v) => set("takenFrom", v)}
                onToChange={(v) => set("takenTo", v)}
                placeholderFrom="desde"
                placeholderTo="hasta"
                type="date"
              />
            </Row>

            <div className="grid gap-1.5">
              <CheckboxRow
                checked={form.isFavorite}
                onChange={(e) => set("isFavorite", e.target.checked)}
                label="Sólo favoritas"
              />
              <CheckboxRow
                checked={form.withoutGallery}
                onChange={(e) => set("withoutGallery", e.target.checked)}
                label="Sin galería"
              />
            </div>

            <ErrorText message={error} />
          </form>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button
            type="submit"
            form="smart-form"
            variant="primary"
            loading={busy}
          >
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────── tiny row/pair helpers ────────────────

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label className="font-mono text-[10.5px] tracking-[.1em] text-ink-3 uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

function RangePair({
  from,
  to,
  onFromChange,
  onToChange,
  placeholderFrom,
  placeholderTo,
  type,
  step,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  placeholderFrom: string;
  placeholderTo: string;
  type: "number" | "date";
  step?: number;
}) {
  return (
    <div className="flex gap-2">
      <TextField
        type={type}
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        placeholder={placeholderFrom}
        step={step}
        containerClassName="flex-1"
      />
      <TextField
        type={type}
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        placeholder={placeholderTo}
        step={step}
        containerClassName="flex-1"
      />
    </div>
  );
}
