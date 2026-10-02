import { afterEach, describe, expect, it, vi } from "vitest";
import { getLyricsById, getLyricsByMetadata, getLookupSignatures, hasCompatibleDuration, isCompatibleRecord, rankCandidates, searchLyrics } from "./lrclib";
import type { LyricsRecord, LrclibRecord, VideoMetadata } from "./types";

afterEach(() => vi.unstubAllGlobals());

const metadata: VideoMetadata = {
  videoId: "abc",
  url: "https://www.youtube.com/watch?v=abc",
  title: "I Want to Live",
  artist: "Borislav Slavov",
  channel: "Borislav Slavov - Topic",
  duration: 233,
  isAd: false,
  thumbnailUrl: "",
  likelyMusic: true,
};

describe("LRCLIB candidate ranking", () => {
  it("puts exact title, artist and duration first", () => {
    const ranked = rankCandidates(metadata, [
      { id: 2, trackName: "I Want to Live (Live)", artistName: "Other Artist", duration: 245, confidence: 0 },
      { id: 1, trackName: "I Want to Live", artistName: "Borislav Slavov", duration: 233, confidence: 0 },
    ]);
    expect(ranked[0].id).toBe(1);
    expect(ranked[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("does not auto-accept a candidate found during an advertisement", () => {
    expect(hasCompatibleDuration({ ...metadata, duration: 15 }, { id: 1, trackName: "I Want to Live", artistName: "Borislav Slavov", duration: 233, confidence: 1 })).toBe(false);
  });

  it("rejects a cached record from another video", () => {
    const cached = { id: 10, trackName: "My Way", artistName: "Frank Sinatra", duration: 276 } as LyricsRecord;
    expect(isCompatibleRecord({ ...metadata, title: "My Way (2008 Remastered)", artist: "Frank Sinatra", duration: 276 }, cached)).toBe(true);
    expect(isCompatibleRecord({ ...metadata, title: "Angels", artist: "Robbie Williams", duration: 236 }, cached)).toBe(false);
  });

  it("tries an album-aware reversed signature when a label uses track-artist-album", () => {
    const semRadar = {
      ...metadata,
      title: "LS Jack",
      artist: "Sem Radar",
      album: "Tudo Outra Vez",
      duration: 234,
      lookupAlternatives: [{ artist: "LS Jack", title: "Sem Radar", album: "Tudo Outra Vez" }],
    };
    expect(getLookupSignatures(semRadar)).toEqual([
      { artist: "Sem Radar", title: "LS Jack", album: "Tudo Outra Vez" },
      { artist: "LS Jack", title: "Sem Radar", album: "Tudo Outra Vez" },
      { artist: "Sem Radar", title: "LS Jack" },
      { artist: "LS Jack", title: "Sem Radar" },
    ]);
    const ranked = rankCandidates(semRadar, [
      { id: 1, trackName: "Sem Radar", artistName: "LS Jack", albumName: "O Melhor de LS Jack", duration: 233.25, confidence: 0 },
      { id: 2, trackName: "Sem Radar", artistName: "LS Jack", albumName: "Tudo Outra Vez", duration: 232, confidence: 0 },
    ]);
    expect(ranked[0]).toMatchObject({ id: 2, confidence: 1 });
    expect(isCompatibleRecord(semRadar, { id: 2, trackName: "Sem Radar", artistName: "LS Jack", duration: 232 } as LyricsRecord)).toBe(true);
  });

  it("keeps a Live video on the closest Live recording instead of the studio track", () => {
    const live = { ...metadata, title: "Wicked Game (Live)", artist: "Chris Isaak", duration: 287 };
    const ranked = rankCandidates(live, [
      { id: 100, trackName: "Wicked Game", artistName: "Chris Isaak", albumName: "Heart Shaped World", duration: 244, confidence: 0 },
      { id: 13798360, trackName: "Wicked Game - Live", artistName: "Chris Isaak", albumName: "Live at the Fillmore", duration: 285, confidence: 0 },
      { id: 23443677, trackName: "Wicked Game (Live)", artistName: "Chris Isaak", albumName: "Live", duration: 287.232, confidence: 0 },
    ]);
    expect(ranked[0]).toMatchObject({ id: 23443677, confidence: 1 });
    expect(ranked.find((candidate) => candidate.id === 100)?.confidence).toBeLessThan(0.9);
  });

  it("prefers the Official Music Video title over a different music-card master", () => {
    const rocket = {
      ...metadata,
      title: "Rocket Man (Official Music Video)",
      artist: "Elton John",
      duration: 282.121,
      lookupAlternatives: [{
        artist: "Elton John",
        title: "Rocket Man (I Think It's Going To Be A Long Long Time) (Surround Sound)",
        album: "Honky Chateau",
      }],
    };
    const ranked = rankCandidates(rocket, [
      {
        id: 10724267,
        trackName: "Elton John - Rocket Man (Official Music Video)",
        artistName: "Elton John",
        albumName: "Elton John",
        duration: 282,
        confidence: 0,
      },
      {
        id: 23290347,
        trackName: "Rocket Man (I Think It's Going To Be A Long Long Time) (Surround Sound)",
        artistName: "Elton John",
        albumName: "Cool - Legends",
        duration: 284,
        confidence: 0,
      },
    ]);
    expect(ranked[0]).toMatchObject({ id: 10724267, confidence: 1 });
  });

  it("requires a clip candidate for a clip video even when the album version is closer", () => {
    const clip = {
      ...metadata,
      title: "Fluorescent Adolescent (Official Video)",
      artist: "Arctic Monkeys",
      duration: 195.201,
      mediaType: "clip" as const,
      lookupAlternatives: [{ artist: "Arctic Monkeys", title: "Fluorescent Adolescent", album: "Favourite Worst Nightmare" }],
    };
    const ranked = rankCandidates(clip, [
      {
        id: 11506272,
        trackName: "Arctic Monkeys - Fluorescent Adolescent (Official Video)",
        artistName: "Arctic Monkeys",
        albumName: "Domino Recording Co.",
        duration: 195,
        confidence: 0,
      },
      {
        id: 14507660,
        trackName: "Fluorescent Adolescent",
        artistName: "Arctic Monkeys",
        albumName: "Favourite Worst Nightmare",
        duration: 196,
        confidence: 0,
      },
    ]);
    expect(ranked[0]).toMatchObject({ id: 11506272, confidence: 1 });
    expect(ranked[1].confidence).toBeLessThan(0.9);
  });
});

describe("automatic timing fallback", () => {
  const holyLand: VideoMetadata = {
    ...metadata, title: "Holy Land", artist: "Angra", album: "Holy Land", duration: 386.141, mediaType: "audio",
  };
  const plain: LrclibRecord = {
    id: 4054775, trackName: "Holy Land", artistName: "Angra", albumName: "Holy Land", duration: 385,
    plainLyrics: "Primeiro verso\nSegundo verso", lyricsfile: "lines: []",
  };
  const timed: LrclibRecord = {
    ...plain, id: 24899228, duration: 387.5345,
    syncedLyrics: "[00:53.18] Primeiro verso\n[00:56.96] Segundo verso",
  };

  function mockLookup(candidates: LrclibRecord[]) {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes("/api/search?") ? candidates : plain,
    ), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("searches past the text-only exact result and preserves the instrumental intro", async () => {
    mockLookup([plain, timed]);
    const record = await getLyricsByMetadata(holyLand);
    expect(record).toMatchObject({ id: 24899228, mode: "lineSynced" });
    expect(record?.lines[0].startMs).toBe(53180);
  });

  it("does not replace an exact text-only result with timing from another recording", async () => {
    mockLookup([
      { ...timed, duration: 412 },
      { ...timed, id: 3, artistName: "Outro artista" },
    ]);
    expect(await getLyricsByMetadata(holyLand)).toMatchObject({ id: 4054775, mode: "plain" });
  });

  it("ranks usable timing above a slightly closer text-only duplicate", () => {
    const candidates = rankCandidates(holyLand, [
      { ...plain, confidence: 0 },
      { ...timed, confidence: 0 },
    ]);
    expect(candidates[0]).toMatchObject({ id: 24899228, confidence: 1 });
  });

  it("rejects a studio record returned by get for a clip after search finds no clip", async () => {
    mockLookup([]);
    expect(await getLyricsByMetadata({
      ...holyLand, title: "Holy Land (Official Video)", mediaType: "clip",
      lookupAlternatives: [{ title: "Holy Land", artist: "Angra", album: "Holy Land" }],
    })).toBeNull();
  });
});

describe("LRCLIB connection retries", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("recovers after three transient failures with increasing pauses", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1, syncedLyrics: "[00:01] Hello" })));
    vi.stubGlobal("fetch", fetchMock);
    const result = getLyricsById(1);
    await vi.advanceTimersByTimeAsync(749);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(await result).toMatchObject({ id: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["server", "network"])("stops after the original request and three retries for %s failures", async (kind) => {
    vi.useFakeTimers();
    const fetchMock = kind === "server"
      ? vi.fn(async () => new Response(null, { status: 503 }))
      : vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(searchLyrics("Artist - Song")).rejects.toThrow(kind === "server" ? "LRCLIB_503" : "Failed to fetch");
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([400, 401, 403, 404])("does not retry HTTP %s", async (status) => {
    const fetchMock = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getLyricsById(1)).rejects.toThrow(status === 404 ? "NOT_FOUND" : `LRCLIB_${status}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["seconds", "date"])("respects Retry-After expressed as %s", async (format) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const retryAfter = format === "seconds" ? "2" : "Thu, 01 Oct 2026 12:00:02 GMT";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": retryAfter } }))
      .mockResolvedValueOnce(new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);
    const result = searchLyrics("Song");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not ignore a long Retry-After or leave the panel waiting for minutes", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503, headers: { "Retry-After": "120" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getLyricsById(1)).rejects.toMatchObject({ message: "LRCLIB_503", retryAfter: 120 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("times out stalled requests and applies the retry limit", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(getLyricsById(1)).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels the retry pause when the lyrics panel is closed", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(getLyricsById(1, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await assertion;
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not retry an explicitly cancelled fetch", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(getLyricsById(1, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await assertion;
    await vi.runAllTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
