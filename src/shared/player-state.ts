/** The floating lyrics panel belongs to the full watch page, not the miniplayer. */
export function canShowLyricsPanel(doc: Document, href: string): boolean {
  const url = new URL(href);
  if (url.pathname !== "/watch" || !url.searchParams.get("v")) return false;
  return !doc.querySelector([
    'ytd-app[miniplayer-is-active]:not([miniplayer-is-active="false"])',
    'ytd-miniplayer[active]:not([active="false"])',
    ".html5-video-player.ytp-player-minimized",
    ".html5-video-player.ytp-miniplayer-active",
  ].join(","));
}

export function observePlayerAvailability(doc: Document, href: () => string, onChange: (available: boolean) => void): () => void {
  let available = canShowLyricsPanel(doc, href());
  const check = () => {
    const next = canShowLyricsPanel(doc, href());
    if (next === available) return;
    available = next;
    onChange(next);
  };
  const observer = new MutationObserver(check);
  observer.observe(doc.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "active", "miniplayer-is-active"],
  });
  const events = ["yt-navigate-finish", "yt-page-data-updated"];
  events.forEach((event) => doc.addEventListener(event, check));
  doc.defaultView?.addEventListener("popstate", check);
  return () => {
    observer.disconnect();
    events.forEach((event) => doc.removeEventListener(event, check));
    doc.defaultView?.removeEventListener("popstate", check);
  };
}
