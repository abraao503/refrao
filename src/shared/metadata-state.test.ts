import { describe, expect, it } from "vitest";
import { metadataKey, MetadataStabilizer } from "./metadata-state";
import type { VideoMetadata } from "./types";

const metadata: VideoMetadata = {
  videoId: "angels", url: "https://www.youtube.com/watch?v=angels", title: "Angels", artist: "Robbie Williams",
  duration: 235.741, channel: "Robbie Williams", isAd: false, likelyMusic: true, thumbnailUrl: "",
};

describe("metadata stability during playlist navigation", () => {
  it("waits for a complete unchanged snapshot before starting a lookup", () => {
    const state = new MetadataStabilizer();
    expect(state.remaining({ ...metadata, duration: 0 }, 0)).toBeGreaterThan(0);
    expect(state.remaining(metadata, 100)).toBe(300);
    expect(state.remaining(metadata, 300)).toBe(100);
    expect(state.remaining(metadata, 400)).toBe(0);
  });

  it("starts the waiting period again when a temporary title or recording changes", () => {
    const state = new MetadataStabilizer();
    expect(state.remaining({ ...metadata, title: "Angeles (Spanish Version)" }, 0)).toBe(300);
    expect(state.remaining(metadata, 200)).toBe(300);
    expect(state.remaining(metadata, 400)).toBe(100);
    expect(state.remaining(metadata, 500)).toBe(0);
    state.reset();
    expect(state.remaining(metadata, 1000)).toBe(300);
  });

  it("ignores fractional duration changes but notices advertisements and lookup context", () => {
    expect(metadataKey(metadata)).toBe(metadataKey({ ...metadata, duration: 235.8 }));
    expect(metadataKey(metadata)).not.toBe(metadataKey({ ...metadata, isAd: true }));
    expect(metadataKey(metadata)).not.toBe(metadataKey({ ...metadata, album: "Angels" }));
    expect(metadataKey(metadata)).not.toBe(metadataKey({ ...metadata, lookupAlternatives: [{ title: "Angels", artist: "Other" }] }));
  });
});
