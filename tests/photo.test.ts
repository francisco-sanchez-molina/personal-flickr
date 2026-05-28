import { describe, expect, it } from "vitest";
import {
  baseUrl,
  fmtDate,
  fmtDuration,
  fmtSize,
  isVideo,
  photoUrl,
  thumbUrl,
} from "~/lib/photo";

describe("photoUrl / thumbUrl / baseUrl", () => {
  const photo = { name: "sunset.jpg", developed_at: 1717000000000 };

  it("encodes the filename and busts the cache with developed_at", () => {
    expect(photoUrl(photo)).toBe("/files/photo/sunset.jpg?v=1717000000000");
    expect(thumbUrl(photo)).toBe("/files/thumb/sunset.jpg?v=1717000000000");
  });

  it("URL-encodes spaces and special chars in the name", () => {
    const p = { name: "My File (1).jpg", developed_at: 0 };
    expect(photoUrl(p)).toBe("/files/photo/My%20File%20(1).jpg?v=0");
  });

  it("base URL omits the cache buster (immutable)", () => {
    expect(baseUrl({ name: "foo.jpg" })).toBe("/files/base/foo.jpg");
  });
});

describe("fmtSize", () => {
  it("renders < 1 MB as KB", () => {
    expect(fmtSize(0)).toBe("0 KB");
    expect(fmtSize(1023)).toBe("1 KB"); // 0.999 KB rounds up to 1
    expect(fmtSize(2048)).toBe("2 KB");
    expect(fmtSize(1024 * 500)).toBe("500 KB");
  });

  it("renders ≥ 1 MB with one decimal place", () => {
    expect(fmtSize(1024 * 1024)).toBe("1.0 MB");
    expect(fmtSize(1024 * 1024 * 2.7)).toBe("2.7 MB");
  });
});

describe("fmtDuration", () => {
  it("returns 0:00 for null / zero / negative", () => {
    expect(fmtDuration(null)).toBe("0:00");
    expect(fmtDuration(undefined)).toBe("0:00");
    expect(fmtDuration(0)).toBe("0:00");
    expect(fmtDuration(-1000)).toBe("0:00");
  });

  it("renders m:ss for under an hour", () => {
    expect(fmtDuration(45 * 1000)).toBe("0:45");
    expect(fmtDuration(95 * 1000)).toBe("1:35");
    expect(fmtDuration(59 * 60 * 1000 + 59 * 1000)).toBe("59:59");
  });

  it("renders h:mm:ss past an hour", () => {
    expect(fmtDuration(60 * 60 * 1000)).toBe("1:00:00");
    expect(fmtDuration((1 * 3600 + 2 * 60 + 3) * 1000)).toBe("1:02:03");
    expect(fmtDuration(10 * 3600 * 1000)).toBe("10:00:00");
  });
});

describe("isVideo", () => {
  it("returns true for kind=video", () => {
    expect(isVideo({ kind: "video" })).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(isVideo({ kind: "photo" })).toBe(false);
  });
});

describe("fmtDate", () => {
  // Locale output varies (es-ES uses 2-digit year via dateStyle: "short");
  // just check it produces a non-empty string that mentions the year.
  it("renders a non-empty date+time string with the year visible", () => {
    const out = fmtDate(Date.UTC(2024, 5, 15, 10, 30));
    // es-ES short → e.g. "15/6/24, 12:30" — accept 2- or 4-digit year.
    expect(out).toMatch(/\b(24|2024)\b/);
    expect(out.length).toBeGreaterThan(5);
  });
});
