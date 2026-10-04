import { createRoot, type Root } from "react-dom/client";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import { readVideoMetadata } from "../src/shared/metadata";
import { metadataKey, MetadataStabilizer } from "../src/shared/metadata-state";
import { canShowLyricsPanel, observePlayerAvailability } from "../src/shared/player-state";
import type { VideoMetadata } from "../src/shared/types";
import { panelStyles } from "../src/ui/styles";
import { Panel } from "../src/ui/Panel";

export default defineContentScript({
  matches: ["https://www.youtube.com/*"],
  runAt: "document_idle",
  main(ctx) {
    if (ctx.isInvalid) return;
    // A reinjection must never reuse controls whose listeners belong to an
    // invalidated isolated world (including leftovers from older builds).
    document.querySelectorAll("#refrao-host, .refrao-player-button, #refrao-player-styles, #refrao-reload-notice").forEach((element) => element.remove());
    let disposed = false;
    const isActive = () => !disposed && !ctx.isInvalid;
    const buttons = new Set<HTMLButtonElement>();
    let playerStyle: HTMLStyleElement | null = null;
    let visible = false;
    let metadata: VideoMetadata | null = null;
    let root: Root | null = null;
    let host: HTMLDivElement | null = null;
    let shadow: ShadowRoot | null = null;
    let mount: HTMLDivElement | null = null;
    let routeVideoId: string | null = null;
    let navigationPending = false;
    let navigationFallbackTimer: number | undefined;
    const metadataStabilizer = new MetadataStabilizer();

    const render = () => {
      if (!isActive() || !root || !mount) return;
      // Preserve position, settings and the loading animation across navigation.
      // Panel cancels obsolete lookups and clears old lyrics before painting.
      root.render(<Panel visible={visible} metadata={metadata} onClose={() => { visible = false; render(); }} />);
    };

    const toggle = () => {
      if (!isActive() || !canShowLyricsPanel(document, window.location.href)) return;
      visible = !visible;
      render();
    };

    const suspendPanel = () => {
      if (!isActive()) return;
      const needsRender = visible || metadata !== null;
      visible = false;
      metadata = null;
      routeVideoId = null;
      metadataStabilizer.reset();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = undefined;
      if (needsRender) render();
      document.querySelectorAll<HTMLButtonElement>(".refrao-player-button").forEach((button) => { button.hidden = true; });
    };

    const ensurePlayerStyles = () => {
      if (document.getElementById("refrao-player-styles")) return;
      const style = document.createElement("style");
      playerStyle = style;
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
      if (!isActive() || host || !document.body) return;
      host = document.createElement("div");
      host.id = "refrao-host";
      Object.assign(host.style, { position: "fixed", inset: "0", zIndex: "2147483646", pointerEvents: "none" });
      shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style"); style.textContent = panelStyles;
      mount = document.createElement("div"); shadow.append(style, mount); document.body.appendChild(host);
      root = createRoot(mount); render();
    };

    const ensurePlayerButton = () => {
      if (!isActive()) return;
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
        buttons.add(button);
        ctx.addEventListener(button, "pointerdown", (event) => event.stopPropagation());
        ctx.addEventListener(button, "click", (event) => { event.stopPropagation(); ensureHost(); toggle(); });
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
      metadataStabilizer.reset();
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
    const refresh = () => {
      if (!isActive()) return;
      if (!canShowLyricsPanel(document, window.location.href)) { suspendPanel(); return; }
      // The player controls can appear before YouTube has finished exposing
      // title/channel/duration metadata. Insert the control immediately and
      // keep the debounced pass only for metadata and panel updates.
      ensurePlayerButton();
      syncRouteVideoId();
      // Coalesce mutations without postponing the read indefinitely while
      // YouTube updates progress, recommendations and other unrelated nodes.
      if (refreshTimer !== undefined) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = undefined;
        if (!isActive()) return;
        if (!canShowLyricsPanel(document, window.location.href)) { suspendPanel(); return; }
        if (navigationPending) return;
        const next = readVideoMetadata();
        // A YouTube SPA navigation can briefly expose the previous title while
        // the URL already points to the next video. Never resurrect metadata
        // from that transition.
        if (!next || next.videoId !== routeVideoId) {
          metadataStabilizer.reset();
          refresh();
          return;
        }
        if (metadataKey(next) === metadataKey(metadata)) {
          metadataStabilizer.reset();
          return;
        }
        if (metadataStabilizer.remaining(next, performance.now()) > 0) {
          refresh();
          return;
        }
        if (metadataKey(next) !== metadataKey(metadata)) {
          metadata = next;
          render();
        }
        ensurePlayerButton();
      }, 180);
    };

    const moveForFullscreen = () => {
      if (!isActive()) return;
      const target = document.fullscreenElement || document.body;
      if (host && target && host.parentElement !== target) target.appendChild(host);
    };

    ctx.onInvalidated(observePlayerAvailability(document, () => window.location.href, (available) => {
      if (!isActive()) return;
      if (!available) suspendPanel();
      else refresh();
    }));
    const onMessage = (message: { type?: string }) => {
      if (isActive() && message.type === "TOGGLE_PANEL") { ensureHost(); toggle(); }
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.addEventListener(document, "fullscreenchange", moveForFullscreen);
    ctx.addEventListener(document, "yt-navigate-start", () => {
      if (!isActive()) return;
      navigationPending = true;
      clearStaleMetadata();
      if (navigationFallbackTimer) window.clearTimeout(navigationFallbackTimer);
      navigationFallbackTimer = window.setTimeout(() => {
        if (!isActive()) return;
        navigationPending = false;
        refresh();
      }, 1500);
    });
    ctx.addEventListener(document, "yt-navigate-finish", () => {
      if (!isActive()) return;
      navigationPending = false;
      if (navigationFallbackTimer) window.clearTimeout(navigationFallbackTimer);
      refresh();
    });
    ctx.addEventListener(document, "yt-page-data-updated", refresh);
    ctx.addEventListener(window, "popstate", refresh);
    ctx.addEventListener(document, "loadedmetadata", refresh, { capture: true });
    ctx.addEventListener(document, "durationchange", refresh, { capture: true });
    const observer = new MutationObserver(() => {
      ensurePlayerButton();
      refresh();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    ctx.onInvalidated(() => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      if (navigationFallbackTimer !== undefined) window.clearTimeout(navigationFallbackTimer);
      try { browser.runtime.onMessage.removeListener(onMessage); }
      catch { /* Chrome may already have detached this runtime. */ }
      root?.unmount();
      host?.remove();
      root = null; host = null; mount = null;
      buttons.forEach((button) => button.remove());
      buttons.clear();
      playerStyle?.remove();
      // No extension APIs in this notice: the old world cannot reconnect.
      // A superseding script with a valid runtime replaces the UI instead.
      if (!browser.runtime.id && document.body) {
        const notice = document.createElement("div");
        notice.id = "refrao-reload-notice";
        notice.setAttribute("role", "status");
        Object.assign(notice.style, { position: "fixed", right: "24px", bottom: "24px", zIndex: "2147483646", padding: "16px", borderRadius: "12px", color: "#fff", background: "#22222b", font: "14px system-ui", maxWidth: "360px" });
        const text = document.createElement("p");
        text.textContent = "O Refrão foi atualizado ou desconectado. Recarregue esta página para continuar.";
        const reload = document.createElement("button");
        reload.type = "button";
        reload.textContent = "Recarregar YouTube";
        reload.addEventListener("click", () => window.location.reload());
        notice.append(text, reload);
        document.body.appendChild(notice);
      }
    });
    // WXT detects a detached runtime when isInvalid/isValid is checked. Its
    // managed interval also catches reloads while YouTube is otherwise idle.
    ctx.setInterval(() => {}, 1000);
    ensureHost(); ensurePlayerButton(); refresh();
  },
});
