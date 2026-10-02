import { describe, expect, it } from "vitest";
import { parseLyricsFile, parseLrc, parseRecord } from "./parsers";

describe("lyrics parsers", () => {
  it("parses multiple LRC timestamps and derives line end times", () => {
    const lines = parseLrc("[00:01.20][00:03.00]Hello\n[00:05.50]World", 10);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ text: "Hello", startMs: 1200, endMs: 3000 });
    expect(lines[2].endMs).toBe(10000);
  });

  it("parses Lyricsfile word timing and chooses word sync", () => {
    const source = `version: '1.0'\nlines:\n  - text: Hello world\n    start_ms: 1000\n    end_ms: 3000\n    words:\n      - text: Hello\n        start_ms: 1000\n        end_ms: 1800\n      - text: ' world'\n        start_ms: 1800\n        end_ms: 3000`;
    const lines = parseLyricsFile(source, 5);
    expect(lines[0].words).toHaveLength(2);
    expect(parseRecord({ id: 1, lyricsfile: source })).toMatchObject({ mode: "wordSynced" });
  });

  it("falls back to plain lyrics when synced data is absent", () => {
    const parsed = parseRecord({ id: 4, plainLyrics: "One\nTwo", duration: 10 });
    expect(parsed.mode).toBe("plain");
    expect(parsed.lines.map((line) => ({ startMs: line.startMs, endMs: line.endMs }))).toEqual([
      { startMs: 0, endMs: 0 },
      { startMs: 0, endMs: 0 },
    ]);
  });
});
