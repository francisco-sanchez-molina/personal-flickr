/**
 * Integration tests for the SQLite query layer (PF-145).
 *
 * These run against a real better-sqlite3 database — tests/setup.ts points
 * DATA_DIR at a throwaway temp dir, so importing `~/lib/db` opens a fresh
 * file and runs the migrations. Each test starts from an empty DB
 * (beforeEach wipes every table), so they're order-independent.
 *
 * Focus: the cross-entity invariants that are easy to break — soft-delete
 * visibility, dedup, share tokens, membership guards — not just CRUD.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  galleryQueries,
  galleryShareQueries,
  photoQueries,
  runSmartFilter,
  search,
  shareQueries,
  tagQueries,
  type PhotoUpsert,
} from "~/lib/db";

let seq = 0;
function makePhoto(overrides: Partial<PhotoUpsert> = {}): number {
  seq += 1;
  const base: PhotoUpsert = {
    name: `photo-${seq}.jpg`,
    mime: "image/jpeg",
    width: 1000,
    height: 800,
    size_bytes: 123456,
    uploaded_at: 1_700_000_000_000 + seq,
    developed_at: 0,
    develop_params: null,
    has_base: 0,
    original_ext: ".jpg",
    camera: null,
    lens: null,
    fstop: null,
    shutter: null,
    iso: null,
    focal: null,
    taken_at: null,
    gps_lat: null,
    gps_lng: null,
    kind: "photo",
    duration_ms: null,
    processing_status: "ready",
    content_hash: null,
    ...overrides,
  };
  return photoQueries.insert(base);
}

beforeEach(() => {
  // Wipe child tables before parents so FK constraints stay happy.
  db.exec(`
    DELETE FROM photo_shares;
    DELETE FROM gallery_shares;
    DELETE FROM photo_galleries;
    DELETE FROM photo_tags;
    DELETE FROM tags;
    DELETE FROM smart_albums;
    DELETE FROM galleries;
    DELETE FROM photos;
  `);
});

describe("photos: insert + lookups", () => {
  it("inserts and reads back by id and name", () => {
    const id = makePhoto({ name: "sunset.jpg" });
    expect(photoQueries.byId(id)?.name).toBe("sunset.jpg");
    expect(photoQueries.byName("sunset.jpg")?.id).toBe(id);
    expect(photoQueries.count()).toBe(1);
  });

  it("list is newest-first by uploaded_at", () => {
    const a = makePhoto({ uploaded_at: 100 });
    const b = makePhoto({ uploaded_at: 200 });
    expect(photoQueries.list().map((p) => p.id)).toEqual([b, a]);
  });
});

describe("trash: soft-delete / restore / purge", () => {
  it("soft-delete hides from browsing but keeps byId + trash list", () => {
    const id = makePhoto();
    photoQueries.softDelete(id);

    expect(photoQueries.list()).toHaveLength(0);
    expect(photoQueries.count()).toBe(0);
    expect(photoQueries.byId(id)?.deleted_at).toBeTypeOf("number");
    expect(photoQueries.listTrash().map((p) => p.id)).toEqual([id]);
    expect(photoQueries.countTrash()).toBe(1);
  });

  it("restore brings it back to live", () => {
    const id = makePhoto();
    photoQueries.softDelete(id);
    photoQueries.restore(id);
    expect(photoQueries.list().map((p) => p.id)).toEqual([id]);
    expect(photoQueries.listTrash()).toHaveLength(0);
    expect(photoQueries.byId(id)?.deleted_at).toBeNull();
  });

  it("purge removes the row entirely", () => {
    const id = makePhoto();
    photoQueries.softDelete(id);
    photoQueries.purge(id);
    expect(photoQueries.byId(id)).toBeNull();
    expect(photoQueries.countTrash()).toBe(0);
  });

  it("trashed photos drop out of favorites", () => {
    const id = makePhoto();
    photoQueries.setFavorite(id, true);
    expect(photoQueries.listFavorites()).toHaveLength(1);
    photoQueries.softDelete(id);
    expect(photoQueries.listFavorites()).toHaveLength(0);
  });
});

describe("dedup by content hash", () => {
  it("matches a live photo, ignores trashed ones", () => {
    const id = makePhoto({ content_hash: "abc123" });
    expect(photoQueries.byHash("abc123")?.id).toBe(id);
    photoQueries.softDelete(id);
    // Re-upload of a trashed photo should not collide.
    expect(photoQueries.byHash("abc123")).toBeNull();
  });

  it("lazy-backfills a missing hash but never overwrites", () => {
    const id = makePhoto({ content_hash: null });
    photoQueries.setContentHashIfMissing(id, "hash-1");
    expect(photoQueries.byId(id)?.content_hash).toBe("hash-1");
    photoQueries.setContentHashIfMissing(id, "hash-2");
    expect(photoQueries.byId(id)?.content_hash).toBe("hash-1");
  });
});

describe("galleries: membership, counts, covers", () => {
  it("photosOf + photo_count exclude trashed photos", () => {
    const g = galleryQueries.create("trip", "Trip", null);
    const a = makePhoto();
    const b = makePhoto();
    galleryQueries.addMember(a, g);
    galleryQueries.addMember(b, g);

    expect(galleryQueries.photosOf(g)).toHaveLength(2);
    expect(galleryQueries.list().find((x) => x.id === g)?.photo_count).toBe(2);

    photoQueries.softDelete(a);
    expect(galleryQueries.photosOf(g).map((p) => p.id)).toEqual([b]);
    expect(galleryQueries.list().find((x) => x.id === g)?.photo_count).toBe(1);
  });

  it("surfaces cover_kind so video covers can render their poster", () => {
    const g = galleryQueries.create("vid", "Video cover", null);
    const v = makePhoto({ name: "clip.mp4", kind: "video" });
    galleryQueries.addMember(v, g);
    galleryQueries.setCover(g, v);
    const summary = galleryQueries.list().find((x) => x.id === g);
    expect(summary?.cover_name).toBe("clip.mp4");
    expect(summary?.cover_kind).toBe("video");
  });

  it("a trashed pinned cover is not surfaced", () => {
    const g = galleryQueries.create("c", "Cover test", null);
    const a = makePhoto();
    galleryQueries.addMember(a, g);
    galleryQueries.setCover(g, a);
    expect(galleryQueries.list().find((x) => x.id === g)?.cover_name).toBe(
      photoQueries.byId(a)?.name,
    );
    photoQueries.softDelete(a);
    expect(galleryQueries.list().find((x) => x.id === g)?.cover_name).toBeNull();
  });

  it("orphans = live photos in no gallery", () => {
    const inGallery = makePhoto();
    const orphan = makePhoto();
    const g = galleryQueries.create("g", "G", null);
    galleryQueries.addMember(inGallery, g);
    expect(photoQueries.listOrphans().map((p) => p.id)).toEqual([orphan]);
    expect(photoQueries.countOrphans()).toBe(1);
    photoQueries.softDelete(orphan);
    expect(photoQueries.countOrphans()).toBe(0);
  });
});

describe("tags", () => {
  it("photosOfTag excludes trashed; counts follow", () => {
    const tag = tagQueries.upsert("beach");
    const a = makePhoto();
    const b = makePhoto();
    tagQueries.addMember(a, tag.id);
    tagQueries.addMember(b, tag.id);
    expect(tagQueries.photosOfTag(tag.id)).toHaveLength(2);
    expect(tagQueries.list().find((t) => t.id === tag.id)?.photo_count).toBe(2);
    photoQueries.softDelete(a);
    expect(tagQueries.photosOfTag(tag.id).map((p) => p.id)).toEqual([b]);
    expect(tagQueries.list().find((t) => t.id === tag.id)?.photo_count).toBe(1);
  });

  it("upsert is case-insensitive and idempotent", () => {
    const t1 = tagQueries.upsert("Sunset");
    const t2 = tagQueries.upsert("sunset");
    expect(t2.id).toBe(t1.id);
  });
});

describe("smart filters", () => {
  it("filters by camera and skips trashed", () => {
    const canon = makePhoto({ camera: "Canon EOS RP" });
    makePhoto({ camera: "Nikon Z6" });
    const trashed = makePhoto({ camera: "Canon EOS RP" });
    photoQueries.softDelete(trashed);

    const res = runSmartFilter({ camera: "Canon EOS RP" });
    expect(res.map((p) => p.id)).toEqual([canon]);
  });

  it("filters by favorite", () => {
    const fav = makePhoto();
    makePhoto();
    photoQueries.setFavorite(fav, true);
    expect(runSmartFilter({ isFavorite: true }).map((p) => p.id)).toEqual([fav]);
  });

  it("empty filter matches every live photo", () => {
    makePhoto();
    makePhoto();
    const trashed = makePhoto();
    photoQueries.softDelete(trashed);
    expect(runSmartFilter({})).toHaveLength(2);
  });
});

describe("search", () => {
  it("matches name / camera and excludes trashed", () => {
    makePhoto({ name: "barcelona.jpg" });
    const trashed = makePhoto({ name: "barcelona-2.jpg" });
    photoQueries.softDelete(trashed);
    expect(search.photos("barcelona").map((p) => p.name)).toEqual([
      "barcelona.jpg",
    ]);
  });
});

describe("photo shares", () => {
  it("create / resolve / count views / revoke", () => {
    const id = makePhoto();
    const share = shareQueries.create("tok_photo", id);
    expect(share.view_count).toBe(0);
    expect(shareQueries.byToken("tok_photo")?.photo_id).toBe(id);
    expect(shareQueries.listForPhoto(id)).toHaveLength(1);

    shareQueries.recordView("tok_photo");
    shareQueries.recordView("tok_photo");
    const after = shareQueries.byToken("tok_photo");
    expect(after?.view_count).toBe(2);
    expect(after?.last_viewed_at).toBeTypeOf("number");

    expect(shareQueries.delete("tok_photo")).toBe(true);
    expect(shareQueries.byToken("tok_photo")).toBeNull();
  });

  it("purging a photo cascades its shares away", () => {
    const id = makePhoto();
    shareQueries.create("tok_cascade", id);
    photoQueries.purge(id);
    expect(shareQueries.byToken("tok_cascade")).toBeNull();
  });

  it("listAll joins photo info", () => {
    const id = makePhoto({ name: "shared.jpg" });
    shareQueries.create("tok_all", id);
    const all = shareQueries.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].photo_name).toBe("shared.jpg");
  });
});

describe("gallery shares", () => {
  it("create / resolve / membership guard / revoke", () => {
    const g = galleryQueries.create("shared-gal", "Shared", null);
    const inside = makePhoto({ name: "inside.jpg" });
    const outside = makePhoto({ name: "outside.jpg" });
    galleryQueries.addMember(inside, g);

    const share = galleryShareQueries.create("tok_gal", g);
    expect(share.gallery_id).toBe(g);
    expect(galleryShareQueries.byToken("tok_gal")?.gallery_id).toBe(g);

    // membership guard backing the public file endpoint
    expect(galleryQueries.memberPhotoByName(g, "inside.jpg")?.id).toBe(inside);
    expect(galleryQueries.memberPhotoByName(g, "outside.jpg")).toBeNull();
    void outside;

    galleryShareQueries.recordView("tok_gal");
    expect(galleryShareQueries.byToken("tok_gal")?.view_count).toBe(1);

    const all = galleryShareQueries.listAll();
    expect(all[0].gallery_name).toBe("Shared");

    expect(galleryShareQueries.delete("tok_gal")).toBe(true);
    expect(galleryShareQueries.byToken("tok_gal")).toBeNull();
  });

  it("a trashed member is no longer reachable through the guard", () => {
    const g = galleryQueries.create("g2", "G2", null);
    const p = makePhoto({ name: "m.jpg" });
    galleryQueries.addMember(p, g);
    expect(galleryQueries.memberPhotoByName(g, "m.jpg")?.id).toBe(p);
    photoQueries.softDelete(p);
    expect(galleryQueries.memberPhotoByName(g, "m.jpg")).toBeNull();
  });

  it("deleting a gallery cascades its shares away", () => {
    const g = galleryQueries.create("doomed", "Doomed", null);
    galleryShareQueries.create("tok_doomed", g);
    galleryQueries.delete(g);
    expect(galleryShareQueries.byToken("tok_doomed")).toBeNull();
  });
});

describe("geotagged listing", () => {
  it("returns only live photos with both coords", () => {
    makePhoto({ gps_lat: 41.4, gps_lng: 2.1 });
    makePhoto({ gps_lat: null, gps_lng: null });
    makePhoto({ gps_lat: 40.4, gps_lng: null });
    const trashed = makePhoto({ gps_lat: 1, gps_lng: 1 });
    photoQueries.softDelete(trashed);
    expect(photoQueries.listGeotagged()).toHaveLength(1);
  });
});
