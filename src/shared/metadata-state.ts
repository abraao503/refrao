import type { VideoMetadata } from "./types";

// Fractional duration updates do not identify a different recording. Ads and
// lookup alternatives do, even when the visible title remains the same.
export function metadataKey(value: VideoMetadata | null): string {
  return value ? JSON.stringify({
    videoId: value.videoId,
    title: value.title,
    artist: value.artist,
    album: value.album,
    duration: Math.round(value.duration),
    mediaType: value.mediaType,
    lookupAlternatives: value.lookupAlternatives,
    isAd: value.isAd,
    likelyMusic: value.likelyMusic,
  }) : "";
}

export class MetadataStabilizer {
  private key = "";
  private since = 0;

  reset(): void {
    this.key = "";
    this.since = 0;
  }

  remaining(value: VideoMetadata | null, now: number): number {
    if (!value || !value.title || !value.artist || !value.channel || (!value.isAd && value.duration <= 0)) {
      this.reset();
      return 180;
    }
    const key = metadataKey(value);
    if (key !== this.key) {
      this.key = key;
      this.since = now;
    }
    return Math.max(0, 300 - (now - this.since));
  }
}
