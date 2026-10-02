import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { readVideoMetadata } from "../src/shared/metadata";
import { canShowLyricsPanel, observePlayerAvailability } from "../src/shared/player-state";
import type { VideoMetadata } from "../src/shared/types";
import { panelStyles } from "../src/ui/styles";
import { Panel } from "../src/ui/Panel";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_idle",
  main(ctx) {
    let visible = false;
    let metadata: VideoMetadata | null = null;
    let root: Root | null = null;
    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let mount: HTMLDivElement | null = null;
    let routeVideoId: string | null = null;
    let navigationPending = false;
    let navigationFromVideoId: string | null = null;
    let navigationFallbackTimer: number | undefined;

    const render = () => {
      if (!root || !mount) return;
      // A new video gets a fresh panel instance so an in-flight lookup from the
      // previous video can never leave its lyrics mounted on the new track.
      root.render(<Panel key={metadata?.videoId || "no-video"} visible={visible} metadata={metadata} onClose={() => { visible = false; render(); }} />);
    };

    const toggle = () => {
      if (!canShowLyricsPanel(document, window.location.href)) return;
      visible = !visible;
      render();
    };

    const suspendPanel = () => {
      const needsRender = visible || metadata !== null;
      visible = false;
      metadata = null;
      routeVideoId = null;
      navigationFromVideoId = null;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (needsRender) render();
      document.querySelectorAll<HTMLButtonElement>(".refrao-player-button").forEach((button) => { button.hidden = true; });
    };

    const ensurePlayerStyles = () => {
      if (document.getElementById("refrao-player-styles")) return;
      const style = document.createElement("style");
      style.id = "refrao-player-styles";
      style.textContent = `
        @keyframes refrao-note-pulse {
          0%, 100% { opacity: .62; transform: scale(.86) rotate(-5deg); }
          50% { opacity: 1; transform: scale(1.08) rotate(4deg); }
        }
        @keyframes refrao-loader-spin { to { transform: rotate(360deg); } }
        .refrao-player-button[hidden] { display: none !important; }
        .refrao-player-icon { overflow: visible; }
        .refrao-player-loading .refrao-player-note {
          transform-box: fill-box;
          transform-origin: center;
          animation: refrao-note-pulse 1.15s ease-in-out infinite;
        }
        .refrao-player-loader {
          opacity: 0;
          transform-origin: 12px 12px;
        }
        .refrao-player-loading .refrao-player-loader {
          opacity: .86;
          animation: refrao-loader-spin .9s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .refrao-player-loading .refrao-player-note,
          .refrao-player-loading .refrao-player-loader { animation: none; }
          .refrao-player-loading .refrao-player-loader { opacity: .65; }
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    };

    const createPlayerIcon = () => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "refrao-player-icon");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      Object.assign(svg.style, { display: "block", width: "24px", height: "24px", flex: "0 0 24px" });
      const loader = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      loader.setAttribute("class", "refrao-player-loader");
      loader.setAttribute("cx", "12");
      loader.setAttribute("cy", "12");
      loader.setAttribute("r", "9");
      loader.setAttribute("fill", "none");
      loader.setAttribute("stroke", "currentColor");
      loader.setAttribute("stroke-width", "1.25");
      loader.setAttribute("stroke-linecap", "round");
      loader.setAttribute("stroke-dasharray", "2 3.5");
      svg.appendChild(loader);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "refrao-player-note");
      path.setAttribute("fill", "currentColor");
      path.setAttribute("d", "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z");
      svg.appendChild(path);
      return svg;
    };

    const ensureHost = () => {
      if (host || !document.body) return;
      host = document.createElement("div");
      host.id = "refrao-host";
      Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "2147483646", pointerEvents: "none" });
      shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style"); style.textContent = panelStyles;
      mount = document.createElement("div"); shadow.append(style, mount); document.body.appendChild(host);
      root = createRoot(mount); render();
    };

    const ensurePlayerButton = () => {
      if (!canShowLyricsPanel(document, window.location.href)) {
        suspendPanel();
        return;
      }
      const player = document.querySelector<HTMLElement>(".html5-video-player");
      const controls = player?.querySelector<HTMLElement>(".ytp-right-controls")
        || document.querySelector<HTMLElement>(".ytp-right-controls");
      const target = controls || player;
      if (!target) return;
      ensurePlayerStyles();
      let button = player?.querySelector<HTMLButtonElement>(".refrao-player-button")
        || document.querySelector<HTMLButtonElement>(".refrao-player-button");
      if (!button) {
        button = document.createElement("button");
        button.className = "ytp-button refrao-player-button";
        button.type = "button";
        button.title = "Abrir letras (Refrão)";
        button.setAttribute("aria-label", "Abrir letras");
        button.appendChild(createPlayerIcon());
        button.addEventListener("pointerdown", (event) => event.stopPropagation());
        button.addEventListener("click", (event) => { event.stopPropagation(); ensureHost(); toggle(); });
      }
      if (!button.querySelector(".refrao-player-icon")) button.replaceChildren(createPlayerIcon());
      if (button.parentElement !== target) {
        if (controls) controls.insertBefore(button, controls.firstChild);
        else target.appendChild(button);
      }
      const fallback = !controls;
      button.classList.toggle("refrao-player-fallback", fallback);
      Object.assign(button.style, fallback ? {
        position: "absolute",
        right: "12px",
        bottom: "10px",
        zIndex: "2",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "48px",
        height: "40px",
        padding: "0",
        color: "#fff",
        lineHeight: "0",
        verticalAlign: "top",
        borderRadius: "4px",
        background: "rgba(0,0,0,.52)",
      } : {
        position: "static",
        right: "",
        bottom: "",
        zIndex: "",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "48px",
        height: "100%",
        padding: "0",
        color: "#fff",
        lineHeight: "0",
        verticalAlign: "top",
        borderRadius: "",
        background: "",
      });
      // During YouTube's initial render the video duration can already exist
      // while title/channel metadata is still empty. Keep the control visible
      // and animated until that metadata is complete.
      const isLoading = !metadata || !metadata.title || !metadata.channel || metadata.duration <= 0;
      const shouldHide = Boolean(metadata && !metadata.likelyMusic && !isLoading);
      button.hidden = shouldHide;
      button.classList.toggle("refrao-player-loading", isLoading && !shouldHide);
      button.title = isLoading ? "Carregando música e letras…" : "Abrir letras (Refrão)";
      button.setAttribute("aria-label", isLoading ? "Carregando letras" : "Abrir letras");
    };

    const clearStaleMetadata = () => {
      if (metadata === null) return;
      metadata = null;
      render();
    };

    const syncRouteVideoId = () => {
      const nextVideoId = new URL(window.location.href).searchParams.get("v");
      if (nextVideoId === routeVideoId) return;
      routeVideoId = nextVideoId;
      clearStaleMetadata();
    };

    let refreshTimer: number | undefined;
    const metadataFingerprint = (value: VideoMetadata | null) => value ? JSON.stringify({
      videoId: value.videoId,
      title: value.title,
      artist: value.artist,
      album: value.album,
      duration: value.duration,
      mediaType: value.mediaType,
      lookupAlternatives: value.lookupAlternatives,
    }) : "";
    const refresh = () => {
      if (!canShowLyricsPanel(document, window.location.href)) { suspendPanel(); return; }
      // The player controls can appear before YouTube has finished exposing
      // title/channel/duration metadata. Insert the control immediately and
      // keep the debounced pass only for metadata and panel updates.
      ensurePlayerButton();
      syncRouteVideoId();
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (!canShowLyricsPanel(document, window.location.href)) { suspendPanel(); return; }
        if (navigationPending) return;
        const next = readVideoMetadata();
        // A YouTube SPA navigation can briefly expose the previous title while
        // the URL already points to the next video. Never resurrect metadata
        // from that transition.
        if (next?.videoId !== routeVideoId) return;
        if (navigationFromVideoId && next.videoId === navigationFromVideoId) return;
        if (metadataFingerprint(next) !== metadataFingerprint(metadata)) {
          metadata = next;
          render();
        }
        navigationFromVideoId = null;
        ensurePlayerButton();
      }, 180);
    };

    const moveForFullscreen = () => {
      const target = document.fullscreenElement || document.body;
      if (host && target && host.parentElement !== target) target.appendChild(host);
    };

    ensureHost(); ensurePlayerButton(); refresh();
    ctx.onInvalidated(observePlayerAvailability(document, () => window.location.href, (available) => {
      if (!available) suspendPanel();
      else refresh();
    }));
    browser.runtime.onMessage.addListener((message: { type?: string }) => {
      if (message.type === "TOGGLE_PANEL") { ensureHost(); toggle(); }
    });
    document.addEventListener("fullscreenchange", moveForFullscreen);
    document.addEventListener("yt-navigate-start", () => {
      navigationPending = true;
      navigationFromVideoId = metadata?.videoId || routeVideoId;
      routeVideoId = null;
      clearStaleMetadata();
      if (navigationFallbackTimer) window.clearTimeout(navigationFallbackTimer);
      navigationFallbackTimer = window.setTimeout(() => {
        navigationPending = false;
        refresh();
      }, 1500);
    });
    document.addEventListener("yt-navigate-finish", () => {
      navigationPending = false;
      if (navigationFallbackTimer) window.clearTimeout(navigationFallbackTimer);
      refresh();
    });
    ["yt-page-data-updated", "popstate"].forEach((event) => document.addEventListener(event, refresh));
    document.addEventListener("loadedmetadata", refresh, true);
    document.addEventListener("durationchange", refresh, true);
    const observer = new MutationObserver(() => {
      ensurePlayerButton();
      refresh();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    ctx.onInvalidated(() => {
      observer.disconnect();
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (navigationFallbackTimer) window.clearTimeout(navigationFallbackTimer);
      root?.unmount();
      host?.remove();
    });
  },
});
