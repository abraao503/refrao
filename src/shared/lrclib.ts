import { parseRecord } from "./parsers";
import { cleanEditorialSuffix, normalizeText } from "./metadata";
import type { CandidateRecord, LyricsLookup, LyricsRecord, LrclibRecord, VideoMetadata } from "./types";
import { LRCLIB_CLIENT } from "./types";

const BASE_URL = "https://lrclib.net";
const REQUEST_GAP_MS = 250;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRY_WAIT_MS = 30_000;
const VERSION_MARKERS = [
  "live",
  "ao vivo",
  "acoustic",
  "acustico",
  "unplugged",
  "remix",
  "remastered",
  "remasterizado",
  "official music video",
  "official video",
  "official audio",
  "music video",
  "lyric video",
  "surround sound",
  "radio edit",
  "edit",
  "version",
  "versao",
  "demo",
  "karaoke",
  "instrumental",
];
const CLIP_MARKERS = ["official music video", "official video", "music video", "video oficial", "official mv", "videoclip", "clipe oficial"];

function toRecord(raw: LrclibRecord): LyricsRecord | null {
  if (!raw || typeof raw.id !== "number") return null;
  const parsed = parseRecord(raw);
  return {
    id: raw.id,
    trackName: raw.trackName || raw.name || "",
    artistName: raw.artistName || "",
    albumName: raw.albumName || null,
    duration: raw.duration || 0,
    instrumental: Boolean(raw.instrumental),
    plainLyrics: raw.plainLyrics || null,
    syncedLyrics: raw.syncedLyrics || null,
    lyricsfile: raw.lyricsfile || null,
    mode: parsed.mode,
    lines: parsed.lines,
    fetchedAt: Date.now(),
  };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason); };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function readRetryAfter(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1_000) : undefined;
}

async function request<T>(path: string, signal?: AbortSignal): Promise<{ data: T }> {
  for (let attempt = 0; ; attempt += 1) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(new DOMException("Tempo limite da consulta ao LRCLIB.", "TimeoutError")), REQUEST_TIMEOUT_MS);
    let failure: unknown;
    let retryable = false;
    let retryAfter: number | undefined;
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: { "Lrclib-Client": LRCLIB_CLIENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        retryAfter = readRetryAfter(response.headers.get("retry-after"));
        const error = new Error(response.status === 404 ? "NOT_FOUND" : `LRCLIB_${response.status}`);
        (error as Error & { retryAfter?: number }).retryAfter = retryAfter;
        failure = error;
        retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      } else {
        return { data: (await response.json()) as T };
      }
    } catch (error) {
      failure = controller.signal.aborted ? controller.signal.reason : error;
      retryable = error instanceof TypeError || (controller.signal.aborted && !signal?.aborted);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
    signal?.throwIfAborted();
    const delay = Math.max(750 * 2 ** attempt, (retryAfter || 0) * 1_000);
    // A long Retry-After remains a user-visible error instead of retrying too
    // early or leaving the panel loading for minutes.
    if (!retryable || attempt >= MAX_RETRIES || delay > MAX_RETRY_WAIT_MS) throw failure;
    await wait(delay, signal);
  }
}

function params(values: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return query.toString();
}

export async function getLyricsByMetadata(metadata: VideoMetadata, signal?: AbortSignal): Promise<LyricsRecord | null> {
  const signatures = getLookupSignatures(metadata);
  let ranked: CandidateRecord[] | undefined;
  let fallback: LyricsRecord | null = null;
  if (signatures.some((signature) => versionMarkers(`${signature.title} ${signature.album || ""}`).length > 0)) {
    ranked = rankCandidates(metadata, await searchLyricsForMetadata(metadata, signal));
    const bestVersion = ranked.find((candidate) => candidate.confidence >= 0.9 && hasCompatibleDuration(metadata, candidate) && hasSyncedLyrics(candidate));
    if (bestVersion) {
      const accepted = await getLyricsById(bestVersion.id, signal);
      if (accepted) return accepted;
    }
  }
  for (let index = 0; index < signatures.length; index += 1) {
    const signature = signatures[index];
    const query = params({
      artist_name: signature.artist,
      track_name: signature.title,
      album_name: signature.album,
      duration: metadata.duration > 0 ? Math.round(metadata.duration) : undefined,
    });
    try {
      const response = await request<LrclibRecord>(`/api/get?${query}`, signal);
      const record = toRecord(response.data);
      if (record && isCompatibleRecord(metadata, record)) {
        if (record.mode === "lineSynced" || record.mode === "wordSynced") return record;
        // Exact metadata can resolve to a text-only duplicate. Look for real
        // timing before falling back to that result.
        fallback ||= record;
        break;
      }
    } catch (error) {
      if ((error as Error).message !== "NOT_FOUND") throw error;
    }
    if (index < signatures.length - 1) await wait(REQUEST_GAP_MS, signal);
  }
  if (fallback) {
    ranked ||= rankCandidates(metadata, await searchLyricsForMetadata(metadata, signal));
    const timed = ranked.find((candidate) => candidate.confidence >= 0.9
      && hasCompatibleDuration(metadata, candidate) && hasSyncedLyrics(candidate));
    if (timed) return toRecord(timed);
  }
  return fallback;
}

export async function getLyricsById(id: number, signal?: AbortSignal): Promise<LyricsRecord | null> {
  const response = await request<LrclibRecord>(`/api/get/${encodeURIComponent(id)}`, signal);
  return toRecord(response.data);
}

export async function searchLyrics(query: string, signal?: AbortSignal): Promise<CandidateRecord[]> {
  const response = await request<LrclibRecord[]>(`/api/search?${params({ q: query })}`, signal);
  return response.data
    .map((record) => ({ ...record, confidence: 0 }))
    .filter((record) => typeof record.id === "number");
}

function signatureKey(signature: LyricsLookup): string {
  return [signature.artist, signature.title, signature.album || ""].map(normalizeText).join("\u0000");
}

function versionMarkers(value: string): string[] {
  const normalized = normalizeText(value);
  return VERSION_MARKERS.filter((marker) => ` ${normalized} `.includes(` ${normalizeText(marker)} `));
}

function hasAnyMarker(value: string, markers: string[]): boolean {
  const normalized = normalizeText(value);
  return markers.some((marker) => ` ${normalized} `.includes(` ${normalizeText(marker)} `));
}

function hasSyncedLyrics(candidate: LrclibRecord): boolean {
  const parsed = parseRecord(candidate);
  return (parsed.mode === "lineSynced" || parsed.mode === "wordSynced")
    && parsed.lines.some((line) => line.text.trim());
}

function hasCompatibleVersion(signature: LyricsLookup, candidate: Pick<CandidateRecord, "trackName" | "name" | "albumName">): boolean {
  const expected = versionMarkers(`${signature.title} ${signature.album || ""}`);
  if (!expected.length) return true;
  const actual = versionMarkers(`${candidate.trackName || candidate.name || ""} ${candidate.albumName || ""}`);
  return expected.every((marker) => actual.includes(marker));
}

export function getLookupSignatures(metadata: VideoMetadata): LyricsLookup[] {
  const base = [
    { artist: metadata.artist, title: metadata.title, ...(metadata.album ? { album: metadata.album } : {}) },
    ...(metadata.lookupAlternatives || []),
  ].filter((signature) => signature.artist.trim() && signature.title.trim());
  // An explicit album makes a precise lookup stronger, but keep the same
  // signature without it as a safe fallback for differently named releases.
  const ordered = [
    ...base.filter((signature) => signature.album),
    ...base.map(({ artist, title }) => ({ artist, title })),
  ];
  const seen = new Set<string>();
  return ordered.filter((signature) => {
    const key = signatureKey(signature);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchLyricsForMetadata(metadata: VideoMetadata, signal?: AbortSignal): Promise<CandidateRecord[]> {
  const queries = new Map<string, string>();
  const signatures = getLookupSignatures(metadata);
  for (const signature of signatures) {
    const query = `${signature.artist} ${signature.title}`.trim();
    queries.set(normalizeText(query), query);
  }
  const candidates = new Map<number, CandidateRecord>();
  const values = [...queries.values()];
  for (let index = 0; index < values.length; index += 1) {
    if (index > 0) await wait(REQUEST_GAP_MS, signal);
    for (const candidate of await searchLyrics(values[index], signal)) candidates.set(candidate.id, candidate);
  }
  // The LRCLIB search treats upload labels as search terms. If the precise
  // video name has no matches, discover candidates without editorial suffixes.
  // Keep recording modifiers (Live, Remix, etc.) and the original metadata
  // for ranking: finding lyrics is not proof that their timing fits the clip.
  if (!candidates.size) {
    for (const signature of signatures) {
      const title = cleanEditorialSuffix(signature.title);
      if (!title || title === signature.title) continue;
      const query = `${signature.artist} ${title}`.trim();
      const key = normalizeText(query);
      if (queries.has(key)) continue;
      queries.set(key, query);
      await wait(REQUEST_GAP_MS, signal);
      for (const candidate of await searchLyrics(query, signal)) candidates.set(candidate.id, candidate);
    }
  }
  return [...candidates.values()];
}

function sameNormalizedArtist(expected: string, actual: string): boolean {
  // Compare the full names, never compact substrings. This handles "Bee Gees"
  // vs "beegees" without promoting a tribute act or a collaboration to exact.
  return Boolean(expected && actual)
    && (expected === actual || expected.replace(/ /g, "") === actual.replace(/ /g, ""));
}

function scoreCandidate(signature: LyricsLookup, metadata: VideoMetadata, candidate: CandidateRecord): { confidence: number; sortScore: number; durationDelta: number } {
  const title = normalizeText(signature.title);
  const artist = normalizeText(signature.artist);
  const album = normalizeText(signature.album || "");
  const candidateTitle = normalizeText(candidate.trackName || candidate.name || "");
  const candidateArtist = normalizeText(candidate.artistName || "");
  const candidateAlbum = normalizeText(candidate.albumName || "");
  const exactArtistMatch = sameNormalizedArtist(artist, candidateArtist);
  const titleWithoutArtist = artist && candidateTitle.startsWith(`${artist} `)
    ? candidateTitle.slice(artist.length + 1)
    : exactArtistMatch && candidateTitle.startsWith(`${candidateArtist} `)
      ? candidateTitle.slice(candidateArtist.length + 1)
      : candidateTitle;
  const titleMatch = candidateTitle === title || titleWithoutArtist === title
    ? 0.55
    : candidateTitle.includes(title) || title.includes(candidateTitle) || titleWithoutArtist.includes(title) || title.includes(titleWithoutArtist)
      ? 0.32
      : 0;
  const artistMatch = artist ? (exactArtistMatch ? 0.35 : (candidateArtist.includes(artist) || artist.includes(candidateArtist)) ? 0.2 : 0) : 0;
  const durationDelta = metadata.duration > 0 && candidate.duration ? Math.abs(metadata.duration - candidate.duration) : 30;
  const durationMatch = durationDelta <= 3 ? 0.1 : durationDelta <= 10 ? 0.05 : 0;
  const albumMatch = album && candidateAlbum ? (candidateAlbum === album ? 0.16 : candidateAlbum.includes(album) || album.includes(candidateAlbum) ? 0.08 : 0) : 0;
  const versionMatch = hasCompatibleVersion(signature, candidate);
  const clipMatch = metadata.mediaType !== "clip" || hasAnyMarker(`${candidate.trackName || candidate.name || ""} ${candidate.albumName || ""}`, CLIP_MARKERS);
  const baseConfidence = Math.min(1, titleMatch + artistMatch + durationMatch);
  // A missing "Live", "Acoustic", "Remix", etc. marker must never be
  // auto-accepted as a substitute for a version explicitly present in the
  // YouTube title. It can remain visible as a manual candidate.
  const confidence = versionMatch && clipMatch ? baseConfidence : Math.min(0.84, baseConfidence);
  const timingMatch = confidence >= 0.9 && durationDelta <= 3 && hasSyncedLyrics(candidate) ? 0.04 : 0;
  return { confidence, sortScore: confidence + albumMatch + timingMatch + (versionMatch ? 0 : -0.35) + (clipMatch ? 0 : -0.45), durationDelta };
}

export function rankCandidates(metadata: VideoMetadata, candidates: CandidateRecord[]): CandidateRecord[] {
  const signatures = getLookupSignatures(metadata);
  return candidates
    .map((candidate) => {
      const best = signatures.reduce<{ confidence: number; sortScore: number; durationDelta: number } | null>((current, signature) => {
        const score = scoreCandidate(signature, metadata, candidate);
        return !current || score.sortScore > current.sortScore || (score.sortScore === current.sortScore && score.durationDelta < current.durationDelta) ? score : current;
      }, null);
      return { candidate, confidence: best?.confidence || 0, sortScore: best?.sortScore || 0, durationDelta: best?.durationDelta ?? Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => b.sortScore - a.sortScore || b.confidence - a.confidence || a.durationDelta - b.durationDelta)
    .map(({ candidate, confidence }) => ({ ...candidate, confidence }));
}

export function hasCompatibleDuration(metadata: VideoMetadata, candidate: CandidateRecord): boolean {
  return !metadata.duration || !candidate.duration || Math.abs(metadata.duration - candidate.duration) <= 3;
}

export function isCompatibleRecord(metadata: VideoMetadata, record: LyricsRecord): boolean {
  const durationMatches = !metadata.duration || !record.duration || Math.abs(metadata.duration - record.duration) <= 8;
  if (metadata.mediaType === "clip" && !hasAnyMarker(record.trackName, CLIP_MARKERS)) return false;
  return durationMatches && getLookupSignatures(metadata).some((signature) => {
    const expectedTitle = normalizeText(signature.title);
    const recordTitle = normalizeText(record.trackName);
    const expectedArtist = normalizeText(signature.artist);
    const recordArtist = normalizeText(record.artistName);
    const titleMatches = !expectedTitle || !recordTitle || recordTitle === expectedTitle || recordTitle.includes(expectedTitle) || expectedTitle.includes(recordTitle);
    const artistMatches = !expectedArtist || !recordArtist || sameNormalizedArtist(expectedArtist, recordArtist) || recordArtist.includes(expectedArtist) || expectedArtist.includes(recordArtist);
    return titleMatches && artistMatches;
  });
}

export { toRecord };
