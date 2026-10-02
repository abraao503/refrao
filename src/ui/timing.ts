import type { LyricsLine } from "../shared/types";

/** Returns the latest lyric that has started at the given playback time. */
export function activeLineIndex(lines: LyricsLine[], timeMs: number): number {
  if (!Number.isFinite(timeMs)) return -1;
  let low = 0;
  let high = lines.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].startMs <= timeMs) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

/** Returns the line that should stay in view, including before the first lyric starts. */
export function lineToCenterIndex(lines: LyricsLine[], timeMs: number): number {
  if (!lines.length || !Number.isFinite(timeMs)) return -1;
  let low = 0;
  let high = lines.length - 1;
  let result = 0;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].startMs <= timeMs) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  if (lines[low].startMs <= timeMs) result = low;
  return result;
}
