import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Panel } from "./Panel";
import { defaultSettings } from "../shared/settings";
import type { ExtensionResponse, LyricsRecord, VideoMetadata } from "../shared/types";

const { request, loadSettings, loadVideoOffset, saveSettings, saveVideoOffset } = vi.hoisted(() => ({
  request: vi.fn(), loadSettings: vi.fn(), loadVideoOffset: vi.fn(), saveSettings: vi.fn(), saveVideoOffset: vi.fn(),
}));
vi.mock("wxt/browser", () => ({ browser: { runtime: { sendMessage: vi.fn() } } }));
vi.mock("./lyrics-request", () => ({ sendLyricsRequest: request }));
vi.mock("../shared/settings", async (importOriginal) => ({
  ...await importOriginal<typeof import("../shared/settings")>(),
  loadSettings,
  loadVideoOffset, saveSettings, saveVideoOffset,
}));

const first: VideoMetadata = {
  videoId: "my-way", url: "https://www.youtube.com/watch?v=my-way", title: "My Way", artist: "Frank Sinatra",
  duration: 277, channel: "Frank Sinatra", isAd: false, likelyMusic: true, thumbnailUrl: "",
};
const next: VideoMetadata = { ...first, videoId: "angels", title: "Angels", artist: "Robbie Williams", duration: 235.741 };
function lyrics(metadata: VideoMetadata): LyricsRecord {
  return {
    id: 1, trackName: metadata.title, artistName: metadata.artist, albumName: null, duration: metadata.duration,
    instrumental: false, plainLyrics: "Verso de " + metadata.title, syncedLyrics: null, lyricsfile: null,
    mode: "plain", lines: [{ id: "line", text: "Verso de " + metadata.title, startMs: 0, endMs: 0 }], fetchedAt: 0,
  };
}

const responses: ((response: ExtensionResponse) => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  responses.length = 0;
  loadSettings.mockResolvedValue({ ...defaultSettings, bounds: { left: 120, top: 100, width: 640, height: 500 } });
  loadVideoOffset.mockResolvedValue(0);
  saveSettings.mockResolvedValue(undefined);
  saveVideoOffset.mockResolvedValue(undefined);
  request.mockImplementation(() => new Promise<ExtensionResponse>((resolve) => { responses.push(resolve); }));
});
afterEach(cleanup);

describe("panel playlist transitions", () => {
  it("keeps its size and position while replacing old lyrics with a continuous loading state", async () => {
    const view = render(<Panel visible metadata={first} onClose={() => {}} />);
    await act(async () => { responses[0]({ ok: true, record: lyrics(first) }); });
    const panel = view.container.querySelector<HTMLElement>(".panel")!;
    expect(panel.style.width).toBe("640px");
    expect(view.container.textContent).toContain("Verso de My Way");

    view.rerender(<Panel visible metadata={null} onClose={() => {}} />);
    expect(view.container.textContent).not.toContain("My Way");
    expect(view.container.textContent).toContain("Carregando a faixa…");
    expect(view.container.querySelector(".search-form")).toBeNull();
    const animation = view.container.querySelector(".loading-art");
    view.rerender(<Panel visible metadata={next} onClose={() => {}} />);
    expect(view.container.querySelector(".panel")).toBe(panel);
    expect(view.container.querySelector(".loading-art")).toBe(animation);
    expect(panel.style.left).toBe("120px");
    expect(panel.style.width).toBe("640px");
    expect(loadSettings).toHaveBeenCalledTimes(1);
    await act(async () => { responses[1]({ ok: true, record: lyrics(next) }); });
    expect(view.container.textContent).toContain("Verso de Angels");
    expect(view.container.textContent).not.toContain("My Way");
  });

  it("cancels the old lookup before painting and ignores its late response", async () => {
    const view = render(<Panel visible metadata={first} onClose={() => {}} />);
    const oldSignal = request.mock.calls[0][1] as AbortSignal;
    view.rerender(<Panel visible metadata={next} onClose={() => {}} />);
    expect(oldSignal.aborted).toBe(true);
    await act(async () => { responses[0]({ ok: true, record: lyrics(first) }); });
    expect(view.container.textContent).not.toContain("My Way");
    expect(view.container.textContent).toContain("Procurando a letra…");
    await act(async () => { responses[1]({ ok: true, record: lyrics(next) }); });
    expect(view.container.textContent).toContain("Verso de Angels");
  });

  it("keeps completed lyrics when YouTube changes only fractional duration", async () => {
    const view = render(<Panel visible metadata={next} onClose={() => {}} />);
    await act(async () => { responses[0]({ ok: true, record: lyrics(next) }); });
    view.rerender(<Panel visible metadata={{ ...next, duration: 235.8 }} onClose={() => {}} />);
    expect(request).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain("Verso de Angels");
  });

  it("handles rejected settings and offset reads and explains context invalidation", async () => {
    loadSettings.mockRejectedValueOnce(new Error("Extension context invalidated."));
    loadVideoOffset.mockRejectedValueOnce(new Error("Extension context invalidated."));
    const view = render(<Panel visible metadata={first} onClose={() => {}} />);
    await act(async () => {});
    expect(view.getByRole("alert").textContent).toContain("Recarregue esta página do YouTube");
    expect(view.container.querySelector<HTMLElement>(".panel")!.style.width).toBe("420px");
  });

  it("does not publish a late storage failure from the previous video", async () => {
    let rejectOffset!: (error: Error) => void;
    loadVideoOffset.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOffset = reject; }));
    const view = render(<Panel visible metadata={first} onClose={() => {}} />);
    view.rerender(<Panel visible metadata={next} onClose={() => {}} />);
    await act(async () => { rejectOffset(new Error("Extension context invalidated.")); });
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("handles rejected settings and offset writes without unhandled promises", async () => {
    const view = render(<Panel visible metadata={first} onClose={() => {}} />);
    await act(async () => { responses[0]({ ok: true, record: lyrics(first) }); });
    saveSettings.mockRejectedValueOnce(new Error("QUOTA_BYTES quota exceeded"));
    fireEvent.click(view.getByRole("button", { name: "Configurações" }));
    fireEvent.change(view.getByLabelText("Tamanho"), { target: { value: "32" } });
    await act(async () => {});
    expect(view.getByRole("alert").textContent).toContain("QUOTA_BYTES");
    saveVideoOffset.mockRejectedValueOnce(new Error("Extension context invalidated."));
    fireEvent.change(view.getByLabelText("Sincronização desta música"), { target: { value: "100" } });
    await act(async () => {});
    expect(view.getByRole("alert").textContent).toContain("Recarregue esta página do YouTube");
  });

  it("shows the real lookup failure instead of masking a disconnected runtime as an LRCLIB error", async () => {
    request.mockRejectedValueOnce(new Error("Extension context invalidated."));
    const view = render(<Panel visible metadata={first} onClose={() => {}} />);
    await act(async () => {});
    expect(view.container.textContent).toContain("Recarregue esta página do YouTube");
    expect(view.container.textContent).not.toContain("Não foi possível consultar as letras.");
  });
});
