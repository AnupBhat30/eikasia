import { describe, expect, test } from "bun:test";

import {
  getTextCurvePathData,
  resolveTextFontFamily,
} from "@/lib/text-style";

describe("text style", () => {
  test("straight text does not allocate a Fabric path", () => {
    expect(getTextCurvePathData(0, 800)).toBeNull();
    expect(getTextCurvePathData(Number.NaN, 800)).toBeNull();
  });

  test("curved text creates scalable upward and downward quadratic paths", () => {
    expect(getTextCurvePathData(50, 1000)).toBe("M 0 140 Q 500 0 1000 140");
    expect(getTextCurvePathData(-50, 1000)).toBe("M 0 0 Q 500 140 1000 0");
    expect(getTextCurvePathData(50, 500)).toBe("M 0 70 Q 250 0 500 70");
  });

  test("curve strength is clamped to the supported range", () => {
    expect(getTextCurvePathData(200, 1000)).toBe(
      getTextCurvePathData(100, 1000),
    );
    expect(getTextCurvePathData(-200, 1000)).toBe(
      getTextCurvePathData(-100, 1000),
    );
  });

  test("Brat text uses the narrow Arial-compatible font stack", () => {
    const fontFamily = resolveTextFontFamily("brat");

    expect(fontFamily).toContain("Arial Narrow");
    expect(fontFamily).toContain("Aptos Narrow");
  });

  test("iconic cinema presets resolve to their closest available type families", () => {
    expect(resolveTextFontFamily("helvetica")).toContain("Helvetica Neue");
    expect(resolveTextFontFamily("futura")).toContain("Futura");
    expect(resolveTextFontFamily("slab")).toContain("Aachen");
    expect(resolveTextFontFamily("script")).toContain("Mistral");
  });
});
