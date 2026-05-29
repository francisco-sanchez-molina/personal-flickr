import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEVELOP,
  paramsToCSSFilter,
  paramsToCSSTransform,
} from "../src/components/lightbox/develop-params";

describe("paramsToCSSFilter", () => {
  it("returns empty string for the identity params", () => {
    expect(paramsToCSSFilter(DEFAULT_DEVELOP)).toBe("");
  });

  it("emits only the channels that differ from identity", () => {
    expect(
      paramsToCSSFilter({
        ...DEFAULT_DEVELOP,
        brightness: 1.2,
      }),
    ).toBe("brightness(1.2)");
  });

  it("joins multiple non-identity channels with spaces", () => {
    expect(
      paramsToCSSFilter({
        brightness: 1.1,
        contrast: 0.9,
        saturation: 1.3,
        hue: 30,
        warmth: 0,
        rotate: 0,
      }),
    ).toBe("brightness(1.1) contrast(0.9) saturate(1.3) hue-rotate(30deg)");
  });

  it("appends sepia() last for warmth", () => {
    expect(paramsToCSSFilter({ ...DEFAULT_DEVELOP, warmth: 0.3 })).toBe(
      "sepia(0.3)",
    );
    expect(
      paramsToCSSFilter({ ...DEFAULT_DEVELOP, saturation: 1.2, warmth: 0.5 }),
    ).toBe("saturate(1.2) sepia(0.5)");
  });

  it("omits sepia when warmth is 0 or undefined (legacy params)", () => {
    expect(paramsToCSSFilter({ ...DEFAULT_DEVELOP, warmth: 0 })).toBe("");
    // Legacy params persisted before `warmth` existed.
    const legacy = { brightness: 1, contrast: 1, saturation: 1, hue: 0, rotate: 0 };
    expect(paramsToCSSFilter(legacy as never)).toBe("");
  });

  it("ignores rotation (that's a transform, not a filter)", () => {
    expect(
      paramsToCSSFilter({ ...DEFAULT_DEVELOP, rotate: 90 }),
    ).toBe("");
  });
});

describe("paramsToCSSTransform", () => {
  it("returns empty string for rotate=0", () => {
    expect(paramsToCSSTransform(DEFAULT_DEVELOP)).toBe("");
  });

  it("emits rotate(Ndeg) for each supported angle", () => {
    expect(paramsToCSSTransform({ ...DEFAULT_DEVELOP, rotate: 90 })).toBe(
      "rotate(90deg)",
    );
    expect(paramsToCSSTransform({ ...DEFAULT_DEVELOP, rotate: 180 })).toBe(
      "rotate(180deg)",
    );
    expect(paramsToCSSTransform({ ...DEFAULT_DEVELOP, rotate: 270 })).toBe(
      "rotate(270deg)",
    );
  });
});

describe("DEFAULT_DEVELOP shape", () => {
  it("has every channel set to identity", () => {
    expect(DEFAULT_DEVELOP).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      hue: 0,
      warmth: 0,
      rotate: 0,
    });
  });
});
