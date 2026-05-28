import { describe, expect, it } from "vitest";
import { cn } from "~/lib/cn";

describe("cn", () => {
  it("joins strings with single spaces", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("filters out falsy values (false / null / undefined / '')", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports the conditional object syntax", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("returns an empty string with no truthy inputs", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});
