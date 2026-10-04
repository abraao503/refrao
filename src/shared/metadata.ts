import type { LyricsLookup, VideoMetadata } from "./types";

const MUSIC_TITLE_HINTS = [
  "official video",
  "official audio",
  "music video",
  "lyrics",
  "lyric video",
  "audio",
  "ao vivo",
  "live session",
  "visualizer",
  "performance",
  "remix",
  "cover",
  "ost",
  "soundtrack",
];

const CHANNEL_HINTS = ["vevo", "topic", "records", "music", "official"];
const CLIP_TITLE_HINTS = ["official music video", "official video", "music video", "video oficial", "official mv", "videoclip", "clipe oficial"];
const AUDIO_TITLE_HINTS = ["official audio", "lyric video", "lyrics", "audio", "visualizer", "áudio"];
const VERSION_TITLE_HINTS = [
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

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(feat\.?|ft\.?)\b/g, " featuring ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanEditorialSuffix(value: string): string {
  return value
    .replace(/\s*[-|•]\s*(official|lyrics?|audio|music video).*$/i, "")
    .replace(/\s*\((?:(?:4k|8k|uhd|hd|hq|\d{3,4}p|\d{2,3}fps)\s+)*(official|lyrics?|audio|music video|visualizer)[^)]*\)$/i, "")
    .replace(/\s*\[(?:(?:4k|8k|uhd|hd|hq|\d{3,4}p|\d{2,3}fps)\s+)*(official|lyrics?|audio|music video|visualizer)[^\]]*\]$/i, "")
    .trim();
}

function containsNormalizedPhrase(value: string, phrase: string): boolean {
  const normalized = normalizeText(value);
  const target = normalizeText(phrase);
  return ` ${normalized} `.includes(` ${target} `);
}

function hasVersionTitleHint(value: string): boolean {
  return VERSION_TITLE_HINTS.some((hint) => containsNormalizedPhrase(value, hint));
}

function detectMediaType(rawTitle: string, channel: string): "clip" | "audio" | "unknown" {
  if (CLIP_TITLE_HINTS.some((hint) => containsNormalizedPhrase(rawTitle, hint))) return "clip";
  if (AUDIO_TITLE_HINTS.some((hint) => containsNormalizedPhrase(rawTitle, hint)) || /topic$/i.test(channel)) return "audio";
  return "unknown";
}

function firstText(selectors: string[]): string {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    const value = element?.textContent?.trim();
    if (value) return value;
  }
  return "";
}

function firstMeta(selectors: string[]): string {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLMetaElement>(selector);
    const value = element?.content?.trim();
    if (value) return value;
  }
  return "";
}

function getRawTitle(): string {
  return firstText(["ytd-watch-metadata h1 yt-formatted-string", "ytd-watch-metadata h1", "h1.title"])
    || firstMeta(["meta[itemprop='name']", "meta[name='title']"])
    || document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim();
}

function getTitle(rawTitle = getRawTitle()): string {
  return cleanEditorialSuffix(rawTitle);
}

function getChannel(): string {
  return firstText([
    "#owner #channel-name a",
    "ytd-watch-metadata #channel-name a",
    "ytd-channel-name a",
    "#upload-info #channel-name a",
  ]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readStructuredText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const record = asRecord(value);
  if (!record) return Array.isArray(value) ? value.map(readStructuredText).join("").trim() : "";
  if (typeof record.text === "string") return record.text;
  if (typeof record.simpleText === "string") return record.simpleText.trim();
  if (typeof record.content === "string") return record.content.trim();
  if (Array.isArray(record.runs)) return record.runs.map(readStructuredText).join("").trim();
  return "";
}

const initialDataVideoIds = new WeakMap<object, string>();

function readMusicFromInitialData(videoId: string): LyricsLookup | null {
  const root = asRecord((window as Window & { ytInitialData?: unknown }).ytInitialData);
  if (!root) return null;
  // ytInitialData can remain the initial page's snapshot after SPA navigation.
  const endpoint = asRecord(asRecord(root.currentVideoEndpoint)?.watchEndpoint);
  const sourceId = typeof endpoint?.videoId === "string" ? endpoint.videoId : initialDataVideoIds.get(root);
  if (sourceId && sourceId !== videoId) return null;
  initialDataVideoIds.set(root, videoId);
  const panels = Array.isArray(root?.engagementPanels) ? root.engagementPanels : [];
  for (const panel of panels) {
    const panelRecord = asRecord(panel);
    const section = asRecord(panelRecord?.engagementPanelSectionListRenderer);
    const content = asRecord(section?.content);
    const structured = asRecord(content?.structuredDescriptionContentRenderer);
    const items = Array.isArray(structured?.items) ? structured.items : [];
    for (const item of items) {
      const renderer = asRecord(asRecord(item)?.horizontalCardListRenderer);
      const header = asRecord(asRecord(renderer?.header)?.richListHeaderRenderer);
      const headerTitle = normalizeText(readStructuredText(header?.title));
      if (headerTitle !== "music" && headerTitle !== "musica") continue;
      const cards = Array.isArray(renderer?.cards) ? renderer.cards : [];
      const model = asRecord(asRecord(cards[0])?.videoAttributeViewModel);
      const title = readStructuredText(model?.title);
      const artist = readStructuredText(model?.subtitle);
      const album = readStructuredText(model?.secondarySubtitle);
      if (title && artist) return { title, artist, ...(album ? { album } : {}) };
    }
  }
  return null;
}

function readMusicFromDom(): LyricsLookup | null {
  const renderers = document.querySelectorAll<HTMLElement>("ytd-structured-description-content-renderer ytd-horizontal-card-list-renderer");
  for (const renderer of renderers) {
    const headerTitle = normalizeText(renderer.querySelector("#header #title")?.textContent || "");
    if (headerTitle !== "music" && headerTitle !== "musica") continue;
    const card = renderer.querySelector<HTMLElement>("yt-video-attribute-view-model");
    const title = card?.querySelector<HTMLElement>(".ytVideoAttributeViewModelTitle")?.textContent?.trim() || "";
    const artist = card?.querySelector<HTMLElement>(".ytVideoAttributeViewModelSubtitle")?.textContent?.trim() || "";
    const album = card?.querySelector<HTMLElement>(".ytVideoAttributeViewModelSecondarySubtitle")?.textContent?.trim() || "";
    if (title && artist) return { title, artist, ...(album ? { album } : {}) };
  }
  return null;
}

function readYouTubeMusicMetadata(videoId: string): LyricsLookup | null {
  return readMusicFromDom() || readMusicFromInitialData(videoId);
}

function musicCardMatchesTitle(music: LyricsLookup, titles: string[]): boolean {
  const cardTitle = normalizeText(music.title);
  const hasExplicitVersion = titles.some(hasVersionTitleHint);
  return titles.some((title) => {
    const expected = normalizeText(title);
    if (!expected || !cardTitle) return false;
    if (cardTitle === expected) return true;
    // A plain title does not authorize a different suffix: YouTube can label
    // the English video "Spanish Version" or "French Radio Mix". Extended
    // names remain alternatives when the video explicitly names a version.
    if (!hasExplicitVersion) return false;
    return cardTitle.startsWith(`${expected} `) || expected.startsWith(`${cardTitle} `);
  });
}

interface ParsedMusicTitle {
  artist: string;
  track: string;
  album?: string;
  lookupAlternatives?: LyricsLookup[];
}

function cleanAlbumName(value: string): string {
  return value
    .replace(/^\s*(?:(?:do|from)\s+)?(?:álbum|album)\s*[:\-–—]?\s*/i, "")
    .trim();
}

function splitAlbumContext(value: string): { title: string; album?: string; fromPipe: boolean } {
  const pipeIndex = value.lastIndexOf("|");
  if (pipeIndex > 0) {
    const title = value.slice(0, pipeIndex).trim();
    const suffix = value.slice(pipeIndex + 1);
    // A single pipe commonly separates artist and song, not song and album
    // (e.g. "TWO DOOR CINEMA CLUB | WHAT YOU KNOW"). Album context needs
    // either an already-separated artist/title or an explicit album label.
    const hasArtistAndTrack = /\s+[-–—]\s+|\|/.test(title);
    const hasAlbumLabel = /^\s*(?:(?:do|from)\s+)?(?:álbum|album)\b/i.test(suffix);
    const album = cleanAlbumName(suffix);
    if (album && (hasArtistAndTrack || hasAlbumLabel)) return { title, album, fromPipe: true };
  }
  const albumMatch = value.match(/\s*[\[(]\s*(?:(?:do|from)\s+)?(?:álbum|album)\s*[:\-–—]?\s*([^\])]+)[\])]\s*$/i);
  if (albumMatch?.[1]) {
    const album = cleanAlbumName(albumMatch[1]);
    if (album) return { title: value.slice(0, albumMatch.index).trim(), album, fromPipe: false };
  }
  return { title: value.trim(), fromPipe: false };
}

function withContext(result: Omit<ParsedMusicTitle, "album" | "lookupAlternatives">, context: ReturnType<typeof splitAlbumContext>, alternative?: LyricsLookup): ParsedMusicTitle {
  return {
    ...result,
    ...(context.album ? { album: context.album } : {}),
    ...(alternative ? { lookupAlternatives: [alternative] } : {}),
  };
}

function parseArtist(rawTitle: string, channel: string): ParsedMusicTitle {
  const context = splitAlbumContext(rawTitle);
  const title = context.title;
  const topicArtist = channel.replace(/\s*-?\s*Topic$/i, "").trim();
  if (topicArtist && /topic$/i.test(channel)) {
    return withContext({ artist: topicArtist, track: title }, context);
  }

  if (channel) {
    const quoted = title.match(/["“]([^"”]+)["”]/);
    if (quoted?.[1]) return withContext({ artist: channel.replace(/\s+(VEVO|Official)$/i, "").trim(), track: quoted[1].trim() }, context);
    const normalizedTitle = normalizeText(title);
    const normalizedChannel = normalizeText(channel);
    const normalizedPrefix = `${normalizedChannel} `;
    if (normalizedTitle.startsWith(normalizedPrefix)) {
      const prefixPattern = new RegExp(`^${channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-–—|:]\\s*`, "i");
      return withContext({ artist: channel.replace(/\s+(VEVO|Official)$/i, "").trim(), track: title.replace(prefixPattern, "").trim() }, context);
    }
  }

  const split = title.split(/\s+[-–—]\s+|\s*\|\s*/);
  if (split.length >= 2 && split[0].length <= 80) {
    const artist = split[0].trim();
    const track = split.slice(1).join(" - ").trim();
    // Record labels often publish tracks as "Faixa - Artista | Álbum". Keep
    // the conventional interpretation first, but try the inverse only when
    // an album separator makes that alternate reading plausible.
    const alternative = context.fromPipe && split.length === 2 && artist && track
      ? { artist: track, title: artist, ...(context.album ? { album: context.album } : {}) }
      : undefined;
    return withContext({ artist, track }, context, alternative);
  }

  return withContext({
    artist: channel.replace(/\s+(VEVO|Official)$/i, "").trim(),
    track: title,
  }, context);
}

export function isLikelyMusicVideo(title: string, channel: string): boolean {
  const body = `${title} ${channel}`.toLowerCase();
  return Boolean(
    document.querySelector(".badge-style-type-music, .badge-style-type-verified-artist")
      || document.querySelector("a[href*='UC-9-kyTW8ZkZNDHQJ6FgpwQ']")
      || document.querySelector("meta[itemprop='genre'][content='Music'], meta[itemprop='genre'][content='music']")
      || MUSIC_TITLE_HINTS.some((hint) => body.includes(hint))
      || CHANNEL_HINTS.some((hint) => channel.toLowerCase().includes(hint)),
  );
}

export function readVideoMetadata(): VideoMetadata | null {
  const url = new URL(window.location.href);
  const videoId = url.searchParams.get("v");
  const video = document.querySelector<HTMLVideoElement>("video");
  if (!videoId || !video) return null;
  const watchVideoId = document.querySelector("ytd-watch-flexy[video-id]")?.getAttribute("video-id");
  // URL, watch-page DOM and player are updated separately during navigation.
  // Do not stamp the new URL onto the previous page's title or music card.
  if (watchVideoId && watchVideoId !== videoId) return null;
  const isAd = Boolean(document.querySelector("#movie_player.ad-showing, .ad-showing, [ad-showing]"));

  const rawTitle = getRawTitle();
  const title = getTitle(rawTitle);
  const channel = getChannel();
  const parsed = parseArtist(title, channel);
  const rawParsed = rawTitle === title ? parsed : parseArtist(rawTitle, channel);
  const musicCard = readYouTubeMusicMetadata(videoId);
  const music = musicCard && musicCardMatchesTitle(musicCard, [
    parsed.track, rawParsed.track, ...(parsed.lookupAlternatives || []).map((lookup) => lookup.title),
  ]) ? musicCard : null;
  const fallbackLookup: LyricsLookup = { artist: parsed.artist, title: parsed.track, ...(parsed.album ? { album: parsed.album } : {}) };
  const rawLookup: LyricsLookup = { artist: rawParsed.artist, title: rawParsed.track, ...(rawParsed.album ? { album: rawParsed.album } : {}) };
  const mediaType = detectMediaType(rawTitle, channel);
  const preferRawTitle = mediaType === "clip" && rawParsed.track !== parsed.track && hasVersionTitleHint(rawParsed.track);
  const primaryLookup = preferRawTitle ? rawLookup : music || fallbackLookup;
  const alternatives = [
    ...(preferRawTitle && music ? [music] : []),
    ...(preferRawTitle ? [fallbackLookup] : []),
    ...(!preferRawTitle && music ? [fallbackLookup] : []),
    ...(parsed.lookupAlternatives || []),
  ].filter((lookup) => lookup.artist !== primaryLookup.artist || lookup.title !== primaryLookup.title || lookup.album !== primaryLookup.album);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    title: primaryLookup.title,
    artist: primaryLookup.artist,
    album: primaryLookup.album,
    lookupAlternatives: alternatives.length ? alternatives : undefined,
    mediaType,
    channel,
    duration,
    isAd,
    thumbnailUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
    // A music card still identifies musical content when its recording name
    // is wrong (as in Angels); only its lookup fields must be discarded.
    likelyMusic: Boolean(musicCard) || isLikelyMusicVideo(rawTitle, channel),
  };
}
