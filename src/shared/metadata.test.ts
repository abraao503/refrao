import { describe, expect, it } from "vitest";
import { isLikelyMusicVideo, normalizeText, readVideoMetadata } from "./metadata";

describe("YouTube metadata heuristics", () => {
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
