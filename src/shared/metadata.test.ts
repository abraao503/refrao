import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanEditorialSuffix, isLikelyMusicVideo, normalizeText, readVideoMetadata } from "./metadata";
import { getLyricsByMetadata } from "./lrclib";

afterEach(() => {
  document.body.replaceChildren();
  delete (window as Window & { ytInitialData?: unknown }).ytInitialData;
  vi.unstubAllGlobals();
});

function musicCard(title: string, artist: string, album?: string): string {
  return `<ytd-structured-description-content-renderer><ytd-horizontal-card-list-renderer>
    <div id="header"><span id="title">Música</span></div>
    <yt-video-attribute-view-model><span class="ytVideoAttributeViewModelTitle">${title}</span>
    <span class="ytVideoAttributeViewModelSubtitle">${artist}</span>
    ${album ? `<span class="ytVideoAttributeViewModelSecondarySubtitle">${album}</span>` : ""}</yt-video-attribute-view-model>
  </ytd-horizontal-card-list-renderer></ytd-structured-description-content-renderer>`;
}

describe("YouTube metadata heuristics", () => {
  it("reads the Two Door Cinema Club pipe-separated upload as artist and song, not song and album", () => {
    window.history.replaceState({}, "", "/watch?v=YXwYJyrKK5A");
    document.body.innerHTML = `<ytd-watch-flexy video-id="YXwYJyrKK5A"><ytd-watch-metadata>
      <h1>TWO DOOR CINEMA CLUB  | WHAT YOU KNOW</h1><div id="channel-name"><a>Two Door Cinema Club</a></div>
      </ytd-watch-metadata>${musicCard("What You Know", "Two Door Cinema Club")}<video></video></ytd-watch-flexy>`;
    Object.defineProperty(document.querySelector("video"), "duration", { value: 191.821 });
    expect(readVideoMetadata()).toMatchObject({
      title: "What You Know", artist: "Two Door Cinema Club", duration: 191.821,
    });
    expect(readVideoMetadata()?.album).toBeUndefined();
  });

  it("automatically resolves the reported video through the corrected title and its real music-card album", async () => {
    window.history.replaceState({}, "", "/watch?v=YXwYJyrKK5A");
    document.body.innerHTML = `<ytd-watch-flexy video-id="YXwYJyrKK5A"><ytd-watch-metadata>
      <h1>TWO DOOR CINEMA CLUB  | WHAT YOU KNOW</h1><div id="channel-name"><a>Two Door Cinema Club</a></div>
      </ytd-watch-metadata>${musicCard("What You Know", "Two Door Cinema Club", "Tourist History (Deluxe Edition)")}<video></video></ytd-watch-flexy>`;
    Object.defineProperty(document.querySelector("video"), "duration", { value: 191.821 });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 4114162, trackName: "What You Know", artistName: "Two Door Cinema Club",
      albumName: "Tourist History (Deluxe Edition)", duration: 190,
      syncedLyrics: "[00:10.00] First line\n[00:14.00] Second line",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const metadata = readVideoMetadata()!;
    expect(metadata).toMatchObject({ title: "What You Know", album: "Tourist History (Deluxe Edition)" });
    expect(await getLyricsByMetadata(metadata)).toMatchObject({ id: 4114162, mode: "lineSynced" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const query = new URL(fetchMock.mock.calls[0][0]).searchParams;
    expect(query.get("track_name")).toBe("What You Know");
    expect(query.get("album_name")).toBe("Tourist History (Deluxe Edition)");
    expect(query.get("duration")).toBe("192");
  });

  it.each([" | ", "  | ", "|"])("parses artist%song without relying on a music card or artist channel", (separator) => {
    window.history.replaceState({}, "", "/watch?v=pipe-song");
    document.body.innerHTML = `<meta name="title" content="Two Door Cinema Club${separator}What You Know"><div id="owner"><div id="channel-name"><a>Music Records</a></div></div><video></video>`;
    const metadata = readVideoMetadata();
    expect(metadata).toMatchObject({ artist: "Two Door Cinema Club", title: "What You Know" });
    expect(metadata?.album).toBeUndefined();
  });

  it.each([
    "Two Door Cinema Club - What You Know | Tourist History",
    "Two Door Cinema Club | What You Know | Tourist History",
    "What You Know | Album Tourist History",
  ])("preserves genuine album context in %s", (title) => {
    window.history.replaceState({}, "", "/watch?v=pipe-album");
    document.body.innerHTML = `<meta name="title" content="${title}"><div id="owner"><div id="channel-name"><a>Two Door Cinema Club</a></div></div><video></video>`;
    expect(readVideoMetadata()).toMatchObject({ artist: "Two Door Cinema Club", title: "What You Know", album: "Tourist History" });
  });

  it("preserves recording modifiers after the artist pipe separator", () => {
    window.history.replaceState({}, "", "/watch?v=pipe-live");
    document.body.innerHTML = '<meta name="title" content="Two Door Cinema Club | What You Know (Live)"><div id="owner"><div id="channel-name"><a>Music Records</a></div></div><video></video>';
    expect(readVideoMetadata()).toMatchObject({ artist: "Two Door Cinema Club", title: "What You Know (Live)" });
  });
  it.each(["(4K Official Video)", "[HD Official Music Video]", "(1080p 60fps Official Video)"])("removes the editorial %s suffix without removing the recording version", (suffix) => {
    expect(cleanEditorialSuffix(`The Summer Is Magic ${suffix}`)).toBe("The Summer Is Magic");
    expect(cleanEditorialSuffix(`Wicked Game (Live) ${suffix}`)).toBe("Wicked Game (Live)");
    expect(cleanEditorialSuffix("The Summer Is Magic (Radio Mix)")).toBe("The Summer Is Magic (Radio Mix)");
  });

  it("preserves the clip lookup and a clean title alternative for the 4K Playahitty upload", () => {
    window.history.replaceState({}, "", "/watch?v=1ZgGPH3Ryy0");
    document.body.innerHTML = `<ytd-watch-flexy video-id="1ZgGPH3Ryy0"><ytd-watch-metadata>
      <h1>Playahitty - The Summer Is Magic (4K Official Video)</h1><div id="channel-name"><a>Conte Max Music</a></div>
      </ytd-watch-metadata>${musicCard("The Summer Is Magic (Radio Mix) (Radio Mix)", "Playahitty")}<video></video></ytd-watch-flexy>`;
    Object.defineProperty(document.querySelector("video"), "duration", { value: 199.021 });
    expect(readVideoMetadata()).toMatchObject({
      title: "The Summer Is Magic (4K Official Video)", artist: "Playahitty", mediaType: "clip",
      lookupAlternatives: expect.arrayContaining([{ title: "The Summer Is Magic", artist: "Playahitty" }]),
    });
  });

  it("rejects the Spanish music card supplied by YouTube for the English Angels video", () => {
    window.history.replaceState({}, "", "/watch?v=luwAMFcc2f8");
    document.body.innerHTML = `<ytd-watch-flexy video-id="luwAMFcc2f8"><ytd-watch-metadata>
      <h1>Robbie Williams - Angels</h1><div id="channel-name"><a>Robbie Williams</a></div>
      </ytd-watch-metadata>${musicCard("Angeles (Spanish Version)", "Robbie Williams")}<video></video></ytd-watch-flexy>`;
    Object.defineProperty(document.querySelector("video"), "duration", { value: 235.741 });
    const metadata = readVideoMetadata();
    expect(metadata).toMatchObject({ title: "Angels", artist: "Robbie Williams", likelyMusic: true });
    expect(metadata?.lookupAlternatives).toBeUndefined();
  });

  it.each(["Angels (Spanish Version)", "Angels (French Radio Mix)"])("does not use an unrequested %s even with the same track title", (cardTitle) => {
    window.history.replaceState({}, "", "/watch?v=angels");
    document.body.innerHTML = `<meta name="title" content="Robbie Williams - Angels"><div id="owner"><div id="channel-name"><a>Robbie Williams</a></div></div>${musicCard(cardTitle, "Robbie Williams")}<video></video>`;
    expect(readVideoMetadata()?.title).toBe("Angels");
  });

  it("waits when the URL points to a new video but the watch page still belongs to the previous one", () => {
    window.history.replaceState({}, "", "/watch?v=angels");
    document.body.innerHTML = '<ytd-watch-flexy video-id="my-way"><ytd-watch-metadata><h1>My Way</h1></ytd-watch-metadata><video></video></ytd-watch-flexy>';
    expect(readVideoMetadata()).toBeNull();
  });

  it("ignores the previous music card while the new title is already present", () => {
    window.history.replaceState({}, "", "/watch?v=angels");
    document.body.innerHTML = `<meta name="title" content="Robbie Williams - Angels"><div id="owner"><div id="channel-name"><a>Robbie Williams</a></div></div>${musicCard("My Way", "Frank Sinatra")}<video></video>`;
    expect(readVideoMetadata()).toMatchObject({ title: "Angels", artist: "Robbie Williams" });
  });

  it("does not reuse ytInitialData from another video, even when the track name matches", () => {
    window.history.replaceState({}, "", "/watch?v=angels");
    document.body.innerHTML = '<meta name="title" content="Robbie Williams - Angels"><div id="owner"><div id="channel-name"><a>Robbie Williams</a></div></div><video></video>';
    Object.defineProperty(window, "ytInitialData", { configurable: true, value: {
      currentVideoEndpoint: { watchEndpoint: { videoId: "previous-cover" } },
      engagementPanels: [{ engagementPanelSectionListRenderer: { content: { structuredDescriptionContentRenderer: { items: [{
        horizontalCardListRenderer: {
          header: { richListHeaderRenderer: { title: "Music" } },
          cards: [{ videoAttributeViewModel: { title: "Angels", subtitle: "Another Artist" } }],
        },
      }] } } } }],
    } });
    expect(readVideoMetadata()).toMatchObject({ title: "Angels", artist: "Robbie Williams" });
  });

  it("normalizes accents, punctuation and featuring markers", () => {
    expect(normalizeText("Beyoncé - Halo (feat. Jay-Z)")).toBe("beyonce halo featuring jay z");
  });

  it("recognizes common music video signals", () => {
    expect(isLikelyMusicVideo("Artist - Official Audio", "ArtistVEVO")).toBe(true);
    expect(isLikelyMusicVideo("Como fazer pão", "Canal de receitas")).toBe(false);
  });

  it("uses quoted track titles and the channel as artist metadata", () => {
    document.body.innerHTML = `<meta name="title" content="Baldur's Gate 3 - OST - &quot;I Want To Live&quot;"><meta itemprop="genre" content="Music"><div id="owner"><div id="channel-name"><a>Borislav Slavov</a></div></div><video></video>`;
    window.history.replaceState({}, "", "/watch?v=test-video");
    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 233 });
    expect(readVideoMetadata()).toMatchObject({ title: "I Want To Live", artist: "Borislav Slavov", duration: 233, isAd: false });
  });

  it("extracts an explicit album annotation from a conventional artist-title video", () => {
    document.body.innerHTML = `<meta name="title" content="Rosa de Saron - Ninguém Mais (Álbum O Agora e o Eterno)"><div id="owner"><div id="channel-name"><a>Rosa De Saron</a></div></div><video></video>`;
    window.history.replaceState({}, "", "/watch?v=rosa-de-saron");
    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 331 });
    expect(readVideoMetadata()).toMatchObject({
      title: "Ninguém Mais",
      artist: "Rosa De Saron",
      album: "O Agora e o Eterno",
    });
  });

  it("keeps a reverse lookup for label titles formatted as track-artist-album", () => {
    document.body.innerHTML = `<meta name="title" content="Sem Radar - LS Jack | Tudo Outra Vez"><div id="owner"><div id="channel-name"><a>Indie Records</a></div></div><video></video>`;
    window.history.replaceState({}, "", "/watch?v=sem-radar");
    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 234 });
    expect(readVideoMetadata()).toMatchObject({
      album: "Tudo Outra Vez",
      lookupAlternatives: [{ artist: "LS Jack", title: "Sem Radar", album: "Tudo Outra Vez" }],
    });
  });

  it("prioritizes YouTube's structured music card over the channel name", () => {
    document.body.innerHTML = `<meta name="title" content="Tempo De Aprender"><div id="owner"><div id="channel-name"><a>Grupo Soweto Oficial</a></div></div><video></video>`;
    window.history.replaceState({}, "", "/watch?v=tempo-de-aprender");
    Object.defineProperty(window, "ytInitialData", {
      configurable: true,
      value: {
        engagementPanels: [{
          engagementPanelSectionListRenderer: {
            content: {
              structuredDescriptionContentRenderer: {
                items: [{
                  horizontalCardListRenderer: {
                    header: { richListHeaderRenderer: { title: { simpleText: "Music" } } },
                    cards: [{ videoAttributeViewModel: { title: "Tempo De Aprender", subtitle: "Soweto", secondarySubtitle: { content: "Farol Das Estrelas" } } }],
                  },
                }],
              },
            },
          },
        }],
      },
    });
    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 242 });
    expect(readVideoMetadata()).toMatchObject({ title: "Tempo De Aprender", artist: "Soweto", album: "Farol Das Estrelas" });
    delete (window as Window & { ytInitialData?: unknown }).ytInitialData;
  });

  it("keeps an explicit video version when YouTube's music card names another master", () => {
    document.body.innerHTML = `<meta name="title" content="Elton John - Rocket Man (Official Music Video)"><div id="owner"><div id="channel-name"><a>Elton John</a></div></div><video></video>`;
    window.history.replaceState({}, "", "/watch?v=rocket-man");
    Object.defineProperty(window, "ytInitialData", {
      configurable: true,
      value: {
        engagementPanels: [{
          engagementPanelSectionListRenderer: {
            content: {
              structuredDescriptionContentRenderer: {
                items: [{
                  horizontalCardListRenderer: {
                    header: { richListHeaderRenderer: { title: { simpleText: "Music" } } },
                    cards: [{ videoAttributeViewModel: {
                      title: "Rocket Man (I Think It's Going To Be A Long Long Time) (Surround Sound)",
                      subtitle: "Elton John",
                      secondarySubtitle: { content: "Honky Chateau" },
                    } }],
                  },
                }],
              },
            },
          },
        }],
      },
    });
    const video = document.querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 282 });
    expect(readVideoMetadata()).toMatchObject({
      title: "Rocket Man (Official Music Video)",
      artist: "Elton John",
      mediaType: "clip",
      lookupAlternatives: expect.arrayContaining([{
        title: "Rocket Man (I Think It's Going To Be A Long Long Time) (Surround Sound)",
        artist: "Elton John",
        album: "Honky Chateau",
      }]),
    });
    delete (window as Window & { ytInitialData?: unknown }).ytInitialData;
  });
});
