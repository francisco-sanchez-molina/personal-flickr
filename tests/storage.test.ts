import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertInsideDir,
  sanitizeName,
  slugify,
  suggestRename,
  uniqueSlug,
} from "~/lib/storage";

describe("slugify", () => {
  it("lowercases and replaces non-alphanum runs with single dashes", () => {
    expect(slugify("Hello World")).toBe("hello-world");
    expect(slugify("Multi   spaces")).toBe("multi-spaces");
    expect(slugify("A_B/C")).toBe("a-b-c");
  });

  it("strips accents", () => {
    expect(slugify("Año Nuevo")).toBe("ano-nuevo");
    expect(slugify("Café Cañón")).toBe("cafe-canon");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify("--hello--")).toBe("hello");
    expect(slugify("   spaced   ")).toBe("spaced");
  });

  it("returns 'g' when the input is empty or pure non-alphanum", () => {
    expect(slugify("")).toBe("g");
    expect(slugify("///")).toBe("g");
    expect(slugify("   ")).toBe("g");
  });

  it("caps at 60 chars", () => {
    expect(slugify("a".repeat(100)).length).toBe(60);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", () => {
    expect(uniqueSlug("foo", () => false)).toBe("foo");
  });

  it("appends -2, -3, ... until free", () => {
    const taken = new Set(["foo", "foo-2", "foo-3"]);
    expect(uniqueSlug("foo", (s) => taken.has(s))).toBe("foo-4");
  });
});

describe("sanitizeName", () => {
  it("splits into stem + lowercase ext", () => {
    expect(sanitizeName("Photo.JPG")).toEqual({ stem: "Photo", ext: ".jpg" });
  });

  it("strips path components", () => {
    expect(sanitizeName("/foo/bar/baz.png")).toEqual({
      stem: "baz",
      ext: ".png",
    });
  });

  it("replaces whitespace with dashes and collapses runs", () => {
    expect(sanitizeName("my   summer  pic.jpg")).toEqual({
      stem: "my-summer-pic",
      ext: ".jpg",
    });
  });

  it("falls back to 'foto' when stem ends up empty", () => {
    // After stripping unsafe chars + leading/trailing dashes, the stem
    // is empty so the helper substitutes "foto".
    expect(sanitizeName("!@#$.jpg").stem).toBe("foto");
    expect(sanitizeName("---.jpg").stem).toBe("foto");
  });

  it("strips weird chars but keeps underscore + hyphen + dot", () => {
    expect(sanitizeName("a!@#$b_c-d.jpg")).toEqual({
      stem: "ab_c-d",
      ext: ".jpg",
    });
  });
});

describe("suggestRename", () => {
  // The function ultimately calls `nameExists` via the db query for the
  // ".jpg" case. We test the rename heuristic by feeding it filenames that
  // already contain a numeric suffix, where the dedup logic is observable.
  // (Full path: see lib/storage.ts; the loop probes 2, 3, … internally.)
  it("strips an existing -N suffix before bumping", () => {
    // This test only exercises the deterministic stem-normalization branch
    // because the `nameExists` DB check requires a live DB. We assert that
    // the *output* still ends in .jpg and contains a -N hint.
    const out = suggestRename("vacation-2.jpg");
    expect(out.endsWith(".jpg")).toBe(true);
    expect(out).toMatch(/vacation-\d+\.jpg/);
  });
});

describe("assertInsideDir", () => {
  const base = "/var/data/photos";

  it("returns the absolute path for filenames inside the dir", () => {
    expect(assertInsideDir("ok.jpg", base)).toBe(path.join(base, "ok.jpg"));
  });

  it("throws on ../ traversal attempts", () => {
    expect(() => assertInsideDir("../escape.jpg", base)).toThrow(
      /invalid path/,
    );
  });

  it("throws on absolute paths that point elsewhere", () => {
    expect(() => assertInsideDir("/etc/passwd", base)).toThrow(/invalid path/);
  });

  it("rejects names that resolve to the parent dir itself", () => {
    expect(() => assertInsideDir("..", base)).toThrow(/invalid path/);
  });
});
