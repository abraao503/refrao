import { describe, expect, it } from "vitest";
import type { LyricsLine } from "../shared/types";
import { activeLineIndex, lineToCenterIndex } from "./timing";

const lines: LyricsLine[] = [
  { id: "one", text: "One", startMs: 1_000, endMs: 2_000 },
  { id: "two", text: "Two", startMs: 5_000, endMs: 6_000 },
  { id: "three", text: "Three", startMs: 10_000, endMs: 11_000 },
];

describe("activeLineIndex", () => {
  it("keeps the previous line active during timing gaps", () => {
    expect(activeLineIndex(lines, 3_500)).toBe(0);
  });

  it("keeps the final line visible after its nominal end", () => {
    expect(activeLineIndex(lines, 12_000)).toBe(2);
  });

  it("does not activate a line before the first timestamp", () => {
    expect(activeLineIndex(lines, 500)).toBe(-1);
  });

  it("centers the upcoming first line before singing starts", () => {
    expect(lineToCenterIndex(lines, 500)).toBe(0);
    expect(lineToCenterIndex(lines, 3_500)).toBe(0);
    expect(lineToCenterIndex(lines, 7_000)).toBe(1);
    expect(lineToCenterIndex(lines, 12_000)).toBe(2);
  });
});
