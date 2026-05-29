import { describe, expect, it } from "vitest";
import {
  DevelopParamsSchema,
  FavoriteBody,
  GalleryCreateBody,
  GalleryUpdateBody,
  SmartFilterSchema,
  TagCreateBody,
  parseJson,
} from "~/lib/validation";

describe("DevelopParamsSchema", () => {
  it("fills missing fields with the identity defaults", () => {
    expect(DevelopParamsSchema.parse({})).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      hue: 0,
      warmth: 0,
      rotate: 0,
    });
  });

  it("clamps warmth to 0..1", () => {
    expect(DevelopParamsSchema.parse({ warmth: 0.5 }).warmth).toBe(0.5);
    expect(() => DevelopParamsSchema.parse({ warmth: 2 })).toThrow();
    expect(() => DevelopParamsSchema.parse({ warmth: -0.1 })).toThrow();
  });

  it("clamps via min/max — out-of-range fails", () => {
    expect(() =>
      DevelopParamsSchema.parse({ brightness: 5 }),
    ).toThrow();
    expect(() => DevelopParamsSchema.parse({ hue: 999 })).toThrow();
  });

  it("rotate accepts only 0 / 90 / 180 / 270", () => {
    expect(DevelopParamsSchema.parse({ rotate: 90 }).rotate).toBe(90);
    expect(() => DevelopParamsSchema.parse({ rotate: 45 })).toThrow();
  });
});

describe("GalleryCreateBody", () => {
  it("trims and rejects empty name", () => {
    expect(() => GalleryCreateBody.parse({ name: "   " })).toThrow();
    expect(GalleryCreateBody.parse({ name: "  Verano 2024  " }).name).toBe(
      "Verano 2024",
    );
  });

  it("accepts optional description and parentId", () => {
    const out = GalleryCreateBody.parse({
      name: "Test",
      description: "Lorem",
      parentId: 5,
    });
    expect(out.description).toBe("Lorem");
    expect(out.parentId).toBe(5);
  });

  it("rejects names longer than 80 chars", () => {
    expect(() =>
      GalleryCreateBody.parse({ name: "x".repeat(81) }),
    ).toThrow();
  });
});

describe("GalleryUpdateBody", () => {
  it("requires at least one field", () => {
    expect(() => GalleryUpdateBody.parse({})).toThrow();
  });
  it("accepts a single field", () => {
    expect(GalleryUpdateBody.parse({ name: "x" })).toEqual({ name: "x" });
  });
});

describe("SmartFilterSchema", () => {
  it("accepts an empty object (matches everything)", () => {
    expect(SmartFilterSchema.parse({})).toEqual({});
  });

  it("validates kind enum", () => {
    expect(SmartFilterSchema.parse({ kind: "photo" }).kind).toBe("photo");
    expect(() => SmartFilterSchema.parse({ kind: "other" })).toThrow();
  });

  it("rejects unknown fields (strict)", () => {
    expect(() =>
      SmartFilterSchema.parse({ camera: "Canon", bogus: 1 }),
    ).toThrow();
  });

  it("rejects negative iso/fstop bounds", () => {
    expect(() =>
      SmartFilterSchema.parse({ isoMin: -1 }),
    ).toThrow();
    expect(() =>
      SmartFilterSchema.parse({ fstopMin: -0.1 }),
    ).toThrow();
  });
});

describe("FavoriteBody / TagCreateBody — trivial schemas", () => {
  it("FavoriteBody requires a boolean", () => {
    expect(FavoriteBody.parse({ value: true }).value).toBe(true);
    expect(() => FavoriteBody.parse({ value: "yes" })).toThrow();
  });

  it("TagCreateBody trims and enforces length", () => {
    expect(TagCreateBody.parse({ name: "  beach  " }).name).toBe("beach");
    expect(() => TagCreateBody.parse({ name: "" })).toThrow();
    expect(() => TagCreateBody.parse({ name: "x".repeat(41) })).toThrow();
  });
});

describe("parseJson — request body helper", () => {
  const make = (body: unknown): Request =>
    new Request("http://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("returns ok:true with parsed data on a valid body", async () => {
    const out = await parseJson(make({ value: true }), FavoriteBody);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.value).toBe(true);
  });

  it("returns a 400 invalid_json response on malformed JSON", async () => {
    const req = new Request("http://example.test", {
      method: "POST",
      body: "{not json",
    });
    const out = await parseJson(req, FavoriteBody);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(400);
      const body = (await out.response.json()) as { error: string };
      expect(body.error).toBe("invalid_json");
    }
  });

  it("returns a 400 invalid_body response on schema mismatch", async () => {
    const out = await parseJson(make({ value: "no" }), FavoriteBody);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(400);
      const body = (await out.response.json()) as {
        error: string;
        detail: string;
      };
      expect(body.error).toBe("invalid_body");
      expect(body.detail).toContain("value");
    }
  });
});
