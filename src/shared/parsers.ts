import { parse as parseYaml } from "yaml";
import type { LyricsLine, LyricsWord, LrclibRecord } from "./types";

const LRC_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function timestampToMs(minutes: string, seconds: string, fraction = "0"): number {
  const fractionMs = fraction.length === 1 ? Number(fraction) * 100 : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction);
  return Number(minutes) * 60_000 + Number(seconds) * 1_000 + fractionMs;
}

function finishLines(lines: LyricsLine[], durationSeconds?: number): LyricsLine[] {
  const sorted = lines
    .filter((line) => Number.isFinite(line.startMs) && line.startMs >= 0)
    .sort((a, b) => a.startMs - b.startMs);
  return sorted.map((line, index) => ({
    ...line,
    endMs: Math.max(
      line.endMs,
      sorted[index + 1]?.startMs ?? (durationSeconds && durationSeconds > line.startMs / 1000 ? durationSeconds * 1000 : line.startMs + 4_000),
    ),
  }));
}

export function parseLrc(source: string, durationSeconds?: number): LyricsLine[] {
  const lines: LyricsLine[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(LRC_TAG)];
    if (matches.length === 0) continue;
    const text = rawLine.replace(LRC_TAG, "").trim();
    for (const match of matches) {
      lines.push({
        id: `lrc-${lines.length}`,
        text,
        startMs: timestampToMs(match[1], match[2], match[3]),
        endMs: 0,
      });
    }
  }
  return finishLines(lines, durationSeconds);
}

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseWord(value: unknown): LyricsWord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const startMs = asNumber(candidate.start_ms);
  const endMs = asNumber(candidate.end_ms);
  const text = typeof candidate.text === "string" ? candidate.text : "";
  if (startMs === null || endMs === null) return null;
  return { text, startMs, endMs };
}

export function parseLyricsFile(source: string, durationSeconds?: number): LyricsLine[] {
  let value: unknown;
  try {
    value = parseYaml(source);
  } catch {
    return [];
  }
  if (!value || typeof value !== "object") return [];
  const rawLines = (value as Record<string, unknown>).lines;
  if (!Array.isArray(rawLines)) return [];
  const lines: LyricsLine[] = [];
  for (const rawLine of rawLines) {
    if (!rawLine || typeof rawLine !== "object") continue;
    const candidate = rawLine as Record<string, unknown>;
    const startMs = asNumber(candidate.start_ms);
    const endMs = asNumber(candidate.end_ms);
    if (startMs === null) continue;
    const words = Array.isArray(candidate.words) ? candidate.words.map(parseWord).filter((word): word is LyricsWord => Boolean(word)) : undefined;
    lines.push({
      id: `lyricsfile-${lines.length}`,
      text: typeof candidate.text === "string" ? candidate.text : "",
      startMs,
      endMs: endMs ?? 0,
      ...(words && words.length > 0 ? { words } : {}),
    });
  }
  return finishLines(lines, durationSeconds);
}

export function parsePlainLyrics(source: string): LyricsLine[] {
  const lines = source.split(/\r?\n/);
  return lines.map((text, index) => ({
    id: `plain-${index}`,
    text,
    startMs: 0,
    endMs: 0,
  }));
}

export function parseRecord(record: LrclibRecord): { lines: LyricsLine[]; mode: "wordSynced" | "lineSynced" | "plain" | "instrumental" } {
  const duration = record.duration ?? undefined;
  if (record.lyricsfile) {
    const lines = parseLyricsFile(record.lyricsfile, duration);
    if (lines.length > 0) {
      return { lines, mode: lines.some((line) => line.words?.length) ? "wordSynced" : "lineSynced" };
    }
  }
  if (record.syncedLyrics) {
    const lines = parseLrc(record.syncedLyrics, duration);
    if (lines.length > 0) return { lines, mode: "lineSynced" };
  }
  if (record.plainLyrics) return { lines: parsePlainLyrics(record.plainLyrics), mode: "plain" };
  return { lines: [], mode: "instrumental" };
}
