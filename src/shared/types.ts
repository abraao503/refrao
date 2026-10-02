export type LyricsMode = "wordSynced" | "lineSynced" | "plain" | "instrumental";

export interface LyricsLookup {
  artist: string;
  title: string;
  album?: string;
}

export interface VideoMetadata {
  videoId: string;
  url: string;
  title: string;
  artist: string;
  album?: string;
  lookupAlternatives?: LyricsLookup[];
  mediaType?: "clip" | "audio" | "unknown";
  channel: string;
  duration: number;
  isAd: boolean;
  thumbnailUrl: string;
  likelyMusic: boolean;
}

export interface LyricsWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface LyricsLine {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  words?: LyricsWord[];
}

export interface LyricsRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
  lyricsfile: string | null;
  mode: LyricsMode;
  lines: LyricsLine[];
  fetchedAt: number;
}

export interface LrclibRecord {
  id: number;
  name?: string | null;
  trackName?: string | null;
  artistName?: string | null;
  albumName?: string | null;
  duration?: number | null;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  lyricsfile?: string | null;
}

export interface CandidateRecord extends LrclibRecord {
  confidence: number;
}

export interface PanelBounds {
  left: number | null;
  top: number | null;
  width: number;
  height: number;
}

export interface UserSettings {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  textAlign: "left" | "center" | "right";
  activeColor: string;
  inactiveColor: string;
  inactiveOpacity: number;
  backgroundOpacity: number;
  backgroundBlur: number;
  animationIntensity: number;
  autoScroll: boolean;
  reducedMotion: "system" | "full" | "reduced";
  bounds: PanelBounds;
}

export type ExtensionRequest =
  | { type: "TOGGLE_PANEL" }
  | { type: "LOOKUP_LYRICS"; metadata: VideoMetadata; query?: string; requestId?: string }
  | { type: "SEARCH_LYRICS"; query: string; requestId?: string }
  | { type: "GET_LYRICS_BY_ID"; id: number; requestId?: string }
  | { type: "CANCEL_LYRICS"; requestId: string }
  | { type: "CLEAR_MAPPING"; videoId: string };

export type ExtensionResponse =
  | { ok: true; record: LyricsRecord | null; candidates?: CandidateRecord[] }
  | { ok: false; error: string; retryAfter?: number };

export const LRCLIB_CLIENT = "Refrao/0.1.0 (https://github.com/abraao503/refrao)";
