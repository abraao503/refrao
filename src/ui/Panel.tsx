import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { defaultSettings, loadSettings, loadVideoOffset, saveSettings, saveVideoOffset } from "../shared/settings";
import type { CandidateRecord, ExtensionResponse, LyricsLine, LyricsRecord, UserSettings, VideoMetadata } from "../shared/types";
import { activeLineIndex, lineToCenterIndex } from "./timing";
import { sendLyricsRequest, type LyricsRequest } from "./lyrics-request";
import { metadataKey } from "../shared/metadata-state";

interface PanelProps {
  visible: boolean;
  metadata: VideoMetadata | null;
  onClose: () => void;
}

function readableError(error: string): string {
  if (error.includes("Extension context invalidated")) return "A extensão foi atualizada ou desconectada. Recarregue esta página do YouTube.";
  if (error === "LRCLIB_429") return "O LRCLIB pediu para aguardar antes de tentar novamente.";
  if (error === "LRCLIB_503") return "O LRCLIB está temporariamente indisponível.";
  if (error.startsWith("LRCLIB_")) return "O serviço de letras recusou esta consulta.";
  if (error === "Failed to fetch") return "Não foi possível acessar o LRCLIB. Verifique sua conexão.";
  return error;
}

function stopVideoShortcuts(event: React.KeyboardEvent): void {
  event.stopPropagation();
}

const OFFSET_MIN_MS = -10_000;
const OFFSET_MAX_MS = 10_000;
const OFFSET_STEP_MS = 100;

function clampOffset(value: number): number {
  return Math.max(OFFSET_MIN_MS, Math.min(OFFSET_MAX_MS, value));
}

function formatOffset(value: number): string {
  return `${value > 0 ? "+" : ""}${value} ms`;
}

function offsetDescription(value: number): string {
  if (value === 0) return "neutro";
  return value > 0 ? `letra adiantada ${value} ms` : `letra atrasada ${Math.abs(value)} ms`;
}

function offsetStatus(value: number): string {
  if (value === 0) return "No tempo";
  return value > 0 ? `Adiantada em ${value} ms` : `Atrasada em ${Math.abs(value)} ms`;
}

function LoadingState({ metadata }: { metadata: VideoMetadata | null }) {
  return <div className="empty-state loading-state" role="status" aria-live="polite" aria-busy="true">
    <div className="loading-art" aria-hidden="true">
      <span className="loading-orbit loading-orbit-a" />
      <span className="loading-orbit loading-orbit-b" />
      <span className="loading-note">♪</span>
      <span className="loading-note loading-note-alt">·</span>
      <div className="loading-lyrics">
        <span className="loading-lyric loading-lyric-one" />
        <span className="loading-lyric loading-lyric-two" />
        <span className="loading-lyric loading-lyric-three" />
      </div>
      <div className="loading-wave">
        {[0, 1, 2, 3, 4, 5, 6].map((bar) => <span key={bar} />)}
      </div>
    </div>
    <strong>{metadata ? "Procurando a letra…" : "Carregando a faixa…"}</strong>
    <p>{metadata ? "Consultando o LRCLIB com os dados deste vídeo." : "Aguardando os dados da nova faixa."}</p>
  </div>;
}

function useClock(enabled: boolean, offsetMs: number): { timeMs: number; isSeeking: boolean } {
  const [timeMs, setTimeMs] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setIsSeeking(false);
      return undefined;
    }
    let frame = 0;
    const video = document.querySelector<HTMLVideoElement>("video");
    if (!video) return undefined;
    const readTime = () => {
      setTimeMs(video.currentTime * 1000 + offsetMs);
    };
    const update = () => {
      frame = 0;
      readTime();
      if (!video.paused && !video.ended) frame = requestAnimationFrame(update);
    };
    const schedule = () => {
      if (!frame && !video.paused && !video.ended) frame = requestAnimationFrame(update);
    };
    const onEvent = () => {
      readTime();
      schedule();
    };
    const onSeeking = () => {
      setIsSeeking(true);
      readTime();
      schedule();
    };
    const onSeeked = () => {
      setIsSeeking(false);
      readTime();
      schedule();
    };
    const events = ["play", "pause", "timeupdate", "ratechange", "loadedmetadata"];
    events.forEach((event) => video.addEventListener(event, onEvent));
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    readTime();
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      events.forEach((event) => video.removeEventListener(event, onEvent));
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
    };
  }, [enabled, offsetMs]);
  return { timeMs, isSeeking };
}

function SettingsDrawer({ settings, update, offsetMs, onOffsetChange, onClose }: { settings: UserSettings; update: (patch: Partial<UserSettings>) => void; offsetMs: number; onOffsetChange: (value: number) => void; onClose: () => void }) {
  return <section className="settings" aria-label="Configurações">
    <div className="settings-header"><strong>Aparência e comportamento</strong><button className="icon-button" aria-label="Fechar configurações" onClick={onClose}>×</button></div>
    <div className="settings-scroll">
      <div className="control"><label htmlFor="font-family">Fonte</label><select id="font-family" value={settings.fontFamily} onChange={(event) => update({ fontFamily: event.target.value })}>
        <option value="Inter, ui-sans-serif, system-ui, sans-serif">Sans limpa</option>
        <option value="Georgia, serif">Serifada</option>
        <option value="ui-monospace, SFMono-Regular, Menlo, monospace">Monoespaçada</option>
        <option value="system-ui, sans-serif">Sistema</option>
      </select></div>
      <div className="control"><div className="control-row"><label htmlFor="font-size">Tamanho</label><span className="value">{settings.fontSize}px</span></div><input id="font-size" type="range" min="18" max="52" value={settings.fontSize} onChange={(event) => update({ fontSize: Number(event.target.value) })} /></div>
      <div className="control"><div className="control-row"><label htmlFor="font-weight">Espessura da fonte</label><span className="value">{settings.fontWeight}</span></div><input id="font-weight" type="range" min="400" max="900" step="100" value={settings.fontWeight} onChange={(event) => update({ fontWeight: Number(event.target.value) })} /></div>
      <div className="control"><div className="control-row"><label htmlFor="line-height">Altura da linha</label><span className="value">{settings.lineHeight.toFixed(2)}</span></div><input id="line-height" type="range" min="1" max="1.8" step=".05" value={settings.lineHeight} onChange={(event) => update({ lineHeight: Number(event.target.value) })} /></div>
      <div className="control"><label htmlFor="text-align">Alinhamento</label><select id="text-align" value={settings.textAlign} onChange={(event) => update({ textAlign: event.target.value as UserSettings["textAlign"] })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></div>
      <div className="control"><div className="control-row"><label htmlFor="active-color">Cor ativa</label><input id="active-color" type="color" value={settings.activeColor} onChange={(event) => update({ activeColor: event.target.value })} /></div><div className="control-row"><label htmlFor="inactive-color">Cor inativa</label><input id="inactive-color" type="color" value={settings.inactiveColor} onChange={(event) => update({ inactiveColor: event.target.value })} /></div></div>
      <div className="control"><div className="control-row"><label htmlFor="opacity">Opacidade inativa</label><span className="value">{Math.round(settings.inactiveOpacity * 100)}%</span></div><input id="opacity" type="range" min=".12" max=".7" step=".02" value={settings.inactiveOpacity} onChange={(event) => update({ inactiveOpacity: Number(event.target.value) })} /></div>
      <div className="control"><div className="control-row"><label htmlFor="intensity">Intensidade das animações</label><span className="value">{Math.round(settings.animationIntensity * 100)}%</span></div><input id="intensity" type="range" min="0" max="1.5" step=".05" value={settings.animationIntensity} onChange={(event) => update({ animationIntensity: Number(event.target.value) })} /></div>
      <div className="control"><div className="control-row"><label htmlFor="offset">Sincronização desta música</label><span className="value">{formatOffset(offsetMs)}</span></div><input id="offset" type="range" min={OFFSET_MIN_MS} max={OFFSET_MAX_MS} step="50" value={offsetMs} aria-valuetext={offsetDescription(offsetMs)} onChange={(event) => onOffsetChange(Number(event.target.value))} /><span className="offset-hint">+ adianta a letra · − atrasa a letra</span></div>
      <div className="control"><label htmlFor="motion">Movimento</label><select id="motion" value={settings.reducedMotion} onChange={(event) => update({ reducedMotion: event.target.value as UserSettings["reducedMotion"] })}><option value="system">Seguir sistema</option><option value="full">Completo</option><option value="reduced">Reduzido</option></select></div>
      <div className="toggle"><label htmlFor="auto-scroll">Acompanhar linha automaticamente</label><input id="auto-scroll" type="checkbox" checked={settings.autoScroll} onChange={(event) => update({ autoScroll: event.target.checked })} /></div>
    </div>
  </section>;
}

export function Panel({ visible, metadata, onClose }: PanelProps) {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [record, setRecord] = useState<LyricsRecord | null>(null);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [query, setQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [videoOffsetMs, setVideoOffsetMs] = useState(0);
  // A fresh panel starts in a loading state so a navigation never flashes the
  // empty/manual-search state before the first lookup effect runs.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const mounted = useRef(false);
  const [highlightedLineId, setHighlightedLineId] = useState<string | null>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const [drag, setDrag] = useState<{ kind: "drag" | "resize"; x: number; y: number; bounds: UserSettings["bounds"] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const syncControlRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Record<string, HTMLParagraphElement | null>>({});
  const programmaticScrollUntil = useRef(0);
  const lastAutoScroll = useRef({ index: -1, at: 0 });
  const scrollAnimationFrame = useRef<number | null>(null);
  const lookupGeneration = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const offsetHoldTimer = useRef<number | null>(null);
  const isTimed = record?.mode === "lineSynced" || record?.mode === "wordSynced";
  const { timeMs, isSeeking } = useClock(visible && isTimed, videoOffsetMs);

  const cancelPendingRequest = () => {
    pendingRequest.current?.abort();
    pendingRequest.current = null;
    lookupGeneration.current += 1;
  };
  const startLyricsRequest = (message: LyricsRequest) => {
    cancelPendingRequest();
    const controller = new AbortController();
    pendingRequest.current = controller;
    return { promise: sendLyricsRequest(message, controller.signal), generation: lookupGeneration.current };
  };
  useLayoutEffect(() => {
    if (!visible) cancelPendingRequest();
    return cancelPendingRequest;
  }, [visible]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void loadSettings().then((value) => { if (active) setSettings(value); }).catch((caught) => {
      if (active) reportStorageError(caught);
    });
    return () => { active = false; mounted.current = false; };
  }, []);
  const reportStorageError = (caught: unknown) => {
    if (!mounted.current) return;
    const detail = caught instanceof Error ? readableError(caught.message) : "Armazenamento indisponível.";
    setStorageError(`Não foi possível acessar as configurações salvas. ${detail}`);
  };
  useEffect(() => {
    let active = true;
    setVideoOffsetMs(0);
    if (!metadata?.videoId) return undefined;
    void loadVideoOffset(metadata.videoId).then((value) => {
      if (active) setVideoOffsetMs(clampOffset(value));
    }).catch((caught) => {
      if (active) reportStorageError(caught);
    });
    return () => { active = false; };
  }, [metadata?.videoId]);
  const updateSettings = (patch: Partial<UserSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      void saveSettings(next).catch(reportStorageError);
      return next;
    });
  };
  const adjustOffset = (delta: number) => {
    setVideoOffsetMs((current) => {
      const next = clampOffset(current + delta);
      if (metadata?.videoId) void saveVideoOffset(metadata.videoId, next).catch(reportStorageError);
      return next;
    });
  };

  const setOffset = (value: number) => {
    const next = clampOffset(value);
    setVideoOffsetMs(next);
    if (metadata?.videoId) void saveVideoOffset(metadata.videoId, next).catch(reportStorageError);
  };

  const stopOffsetHold = () => {
    if (offsetHoldTimer.current !== null) {
      window.clearTimeout(offsetHoldTimer.current);
      offsetHoldTimer.current = null;
    }
  };

  const startOffsetHold = (delta: number) => {
    stopOffsetHold();
    adjustOffset(delta);
    const startedAt = performance.now();
    let delay = 260;
    const tick = () => {
      adjustOffset(delta);
      const elapsed = performance.now() - startedAt;
      delay = elapsed > 1_800 ? 55 : elapsed > 900 ? 90 : 140;
      offsetHoldTimer.current = window.setTimeout(tick, delay);
    };
    offsetHoldTimer.current = window.setTimeout(tick, delay);
  };

  useEffect(() => () => stopOffsetHold(), []);

  useEffect(() => {
    if (!syncOpen) return undefined;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!event.composedPath().includes(syncControlRef.current as EventTarget)) setSyncOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick, true);
  }, [syncOpen]);

  useEffect(() => {
    if (!visible) setSyncOpen(false);
  }, [visible]);

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    stopVideoShortcuts(event);
    if (event.key === "Escape" && syncOpen) {
      event.preventDefault();
      setSyncOpen(false);
    }
  };

  const beginLookup = (currentMetadata: VideoMetadata): (() => void) | undefined => {
    cancelPendingRequest();
    setSelectionMode(false);
    if (currentMetadata.isAd) {
      setLoading(false); setError(""); setRecord(null); setCandidates([]); setHighlightedLineId(null); return undefined;
    }
    let cancelled = false;
    setLoading(true); setError(""); setRecord(null); setCandidates([]); setHighlightedLineId(null); setUserScrolled(false);
    const { promise, generation } = startLyricsRequest({ type: "LOOKUP_LYRICS", metadata: currentMetadata });
    void promise.then((response) => {
      if (cancelled || generation !== lookupGeneration.current) return;
      setLoading(false);
      if (!response.ok) { setError(readableError(response.error)); return; }
      setRecord(response.record); setCandidates(response.candidates || []);
    }).catch((caught) => {
      if (!cancelled && generation === lookupGeneration.current) {
        setLoading(false);
        setError(readableError(caught instanceof Error ? caught.message : "Não foi possível consultar as letras."));
      }
    });
    return () => {
      cancelled = true;
      if (generation === lookupGeneration.current) cancelPendingRequest();
    };
  };

  // Reset the song-specific state before painting, without remounting the
  // panel. Otherwise old lyrics/header can flash once on a new video.
  useLayoutEffect(() => {
    if (!visible) return undefined;
    stopOffsetHold();
    cancelScrollAnimation();
    setSyncOpen(false);
    setQuery("");
    lastAutoScroll.current = { index: -1, at: 0 };
    programmaticScrollUntil.current = 0;
    if (!metadata) {
      cancelPendingRequest();
      setRecord(null); setCandidates([]); setError(""); setLoading(true);
      setSelectionMode(false); setHighlightedLineId(null); setUserScrolled(false);
      return undefined;
    }
    return beginLookup(metadata);
  }, [visible, metadataKey(metadata)]);

  const index = useMemo(() => record && isTimed ? activeLineIndex(record.lines, timeMs) : -1, [record, isTimed, timeMs]);
  const centerIndex = useMemo(() => record && isTimed ? lineToCenterIndex(record.lines, timeMs) : -1, [record, isTimed, timeMs]);

  const cancelScrollAnimation = () => {
    if (scrollAnimationFrame.current !== null) {
      cancelAnimationFrame(scrollAnimationFrame.current);
      scrollAnimationFrame.current = null;
    }
  };

  const animateScrollTo = (container: HTMLDivElement, top: number, behavior: ScrollBehavior) => {
    cancelScrollAnimation();
    if (behavior === "auto") {
      container.scrollTop = top;
      return;
    }

    const start = container.scrollTop;
    const distance = top - start;
    if (Math.abs(distance) < 1) {
      container.scrollTop = top;
      return;
    }
    const duration = Math.min(300, Math.max(180, 180 + Math.abs(distance) * 0.12));
    const startedAt = performance.now();
    const easeOut = (value: number) => 1 - ((1 - value) ** 3);
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      container.scrollTop = start + distance * easeOut(progress);
      if (progress < 1) scrollAnimationFrame.current = requestAnimationFrame(step);
      else {
        container.scrollTop = top;
        scrollAnimationFrame.current = null;
      }
    };
    scrollAnimationFrame.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelScrollAnimation(), []);

  const centerActiveLine = (lineIndex: number, requestedBehavior?: ScrollBehavior): boolean => {
    const container = scrollRef.current;
    const line = record?.lines[lineIndex];
    const element = line
      ? lineRefs.current[line.id] || container?.querySelector<HTMLParagraphElement>(`[data-line-id="${CSS.escape(line.id)}"]`)
      : null;
    if (!container || !element) return false;

    const now = performance.now();
    if (lastAutoScroll.current.index === lineIndex && now - lastAutoScroll.current.at < 750) return false;

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const targetTop = container.scrollTop + elementRect.top - containerRect.top - (container.clientHeight - elementRect.height) / 2;
    const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const top = Math.max(0, Math.min(maxTop, targetTop));
    if (Math.abs(top - container.scrollTop) < Math.max(8, elementRect.height * 0.25)) return false;

    const systemReduced = settings.reducedMotion === "system" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const behavior = requestedBehavior || (settings.reducedMotion === "reduced" || systemReduced ? "auto" : "smooth");
    lastAutoScroll.current = { index: lineIndex, at: now };
    programmaticScrollUntil.current = Date.now() + 1000;
    animateScrollTo(container, top, behavior);
    return behavior === "smooth";
  };

  useLayoutEffect(() => {
    if (!record || centerIndex < 0 || !record.lines[centerIndex] || !settings.autoScroll || userScrolled || settingsOpen) return undefined;

    let frame = 0;
    let attempts = 0;
    const lineId = record.lines[centerIndex].id;
    const tryCenter = () => {
      const container = scrollRef.current;
      const element = container?.querySelector<HTMLParagraphElement>(`[data-line-id="${CSS.escape(lineId)}"]`);
      if (!container || !element) {
        if (attempts < 2) {
          attempts += 1;
          frame = requestAnimationFrame(tryCenter);
        }
        return;
      }
      centerActiveLine(centerIndex, isSeeking ? "auto" : undefined);
    };

    frame = requestAnimationFrame(tryCenter);
    return () => cancelAnimationFrame(frame);
  }, [centerIndex, isSeeking, record, settings.autoScroll, settingsOpen, userScrolled]);

  useEffect(() => {
    if (!record || centerIndex < 0 || !record.lines[centerIndex]) {
      setHighlightedLineId(null);
      return undefined;
    }

    if (index < 0 || !record.lines[index]) {
      setHighlightedLineId(null);
      return undefined;
    }

    const targetId = record.lines[index].id;
    const systemReduced = settings.reducedMotion === "system" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const reduced = settings.reducedMotion === "reduced" || systemReduced;
    const moved = lastAutoScroll.current.index === centerIndex && performance.now() - lastAutoScroll.current.at < 100;
    const delay = isSeeking || (moved && !reduced) ? (isSeeking ? 0 : 260) : 0;
    const timer = window.setTimeout(() => setHighlightedLineId(targetId), delay);
    return () => window.clearTimeout(timer);
  }, [centerIndex, index, isSeeking, settings.autoScroll, settings.reducedMotion, settingsOpen, userScrolled, record]);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSelectionMode(true);
    setLoading(true); setError("");
    const { promise, generation } = startLyricsRequest({ type: "SEARCH_LYRICS", query: query.trim() });
    try {
      const response = await promise;
      if (generation !== lookupGeneration.current) return;
      if (!response.ok) throw new Error(response.error);
      setCandidates(response.candidates || []);
    } catch (caught) { if (generation === lookupGeneration.current) setError(readableError(caught instanceof Error ? caught.message : "Busca indisponível.")); }
    finally { if (generation === lookupGeneration.current) setLoading(false); }
  };

  const retryLookup = () => {
    if (!metadata || metadata.isAd) return;
    beginLookup(metadata);
  };

  const changeLyrics = async () => {
    if (!metadata) return;
    cancelPendingRequest();
    const generation = lookupGeneration.current;
    setLoading(true); setError("");
    try {
      const response = await browser.runtime.sendMessage({ type: "CLEAR_MAPPING", videoId: metadata.videoId }) as ExtensionResponse;
      if (generation !== lookupGeneration.current) return;
      if (!response.ok) throw new Error(response.error);
      setRecord(null);
      setCandidates([]);
      setHighlightedLineId(null);
      setVideoOffsetMs(0);
      setSelectionMode(true);
      setQuery(`${metadata.artist} - ${metadata.title}`.replace(/^\s*-\s*|\s*-\s*$/g, "").trim());
    } catch (caught) {
      if (generation === lookupGeneration.current) setError(readableError(caught instanceof Error ? caught.message : "Não foi possível liberar a seleção da letra."));
    } finally {
      if (generation === lookupGeneration.current) setLoading(false);
    }
  };

  const cancelChangeLyrics = () => {
    if (!metadata) return;
    beginLookup(metadata);
  };

  const selectCandidate = async (candidate: CandidateRecord) => {
    if (!metadata) return;
    setLoading(true); setError("");
    const { promise, generation } = startLyricsRequest({ type: "GET_LYRICS_BY_ID", id: candidate.id });
    try {
      const response = await promise;
      if (generation !== lookupGeneration.current) return;
      if (!response.ok || !response.record) throw new Error(response.ok ? "Registro vazio." : response.error);
      await browser.runtime.sendMessage({ type: "SAVE_MAPPING", videoId: metadata.videoId, id: candidate.id });
      if (generation !== lookupGeneration.current) return;
      setHighlightedLineId(null); setRecord(response.record); setCandidates([]); setSelectionMode(false);
    } catch (caught) { if (generation === lookupGeneration.current) setError(readableError(caught instanceof Error ? caught.message : "Não foi possível carregar esta letra.")); }
    finally { if (generation === lookupGeneration.current) setLoading(false); }
  };

  const seekTo = (line: LyricsLine) => {
    if (!isTimed) return;
    const video = document.querySelector<HTMLVideoElement>("video");
    if (!video || !Number.isFinite(line.startMs)) return;

    // The clock displays video.currentTime + offset, so the inverse operation
    // is needed when a lyric is clicked. Keep the target inside the media range
    // because some LRCLIB timestamps can be a few milliseconds past the video.
    const targetSeconds = Math.max(0, line.startMs / 1000 - videoOffsetMs / 1000);
    const maxSeconds = Number.isFinite(video.duration) && video.duration > 0 ? Math.max(0, video.duration - 0.05) : targetSeconds;
    video.currentTime = Math.min(targetSeconds, maxSeconds);
  };

  const beginPointer = (event: React.PointerEvent, kind: "drag" | "resize") => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ kind, x: event.clientX, y: event.clientY, bounds: { ...settings.bounds } });
  };
  useEffect(() => {
    if (!drag) return undefined;
    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
      const next = drag.kind === "drag"
        ? { ...drag.bounds, left: Math.max(8, (drag.bounds.left ?? window.innerWidth - drag.bounds.width - 24) + dx), top: Math.max(8, (drag.bounds.top ?? 88) + dy) }
        : { ...drag.bounds, width: Math.max(320, Math.min(window.innerWidth - 16, drag.bounds.width + dx)), height: Math.max(360, Math.min(window.innerHeight - 16, drag.bounds.height + dy)) };
      setSettings((current) => ({ ...current, bounds: next }));
    };
    const onUp = () => { setDrag(null); setSettings((current) => { void saveSettings(current).catch(reportStorageError); return current; }); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp, { once: true });
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [drag]);

  const bounds = settings.bounds;
  const panelStyle = {
    width: `${bounds.width}px`, height: `${Math.min(bounds.height, Math.max(360, window.innerHeight - 16))}px`,
    left: bounds.left === null ? undefined : `${bounds.left}px`, right: bounds.left === null ? "24px" : undefined,
    top: bounds.top === null ? "88px" : `${bounds.top}px`,
    "--font-size": `${settings.fontSize}px`, "--font-weight": settings.fontWeight, "--line-height": settings.lineHeight,
    "--text-align": settings.textAlign, "--active-color": settings.activeColor, "--inactive-color": settings.inactiveColor,
    "--inactive-opacity": settings.inactiveOpacity, "--intensity": settings.animationIntensity,
    background: `linear-gradient(140deg, rgba(38,38,46,${settings.backgroundOpacity}), rgba(13,13,18,${Math.max(.55, settings.backgroundOpacity - .1)}))`,
    backdropFilter: `blur(${settings.backgroundBlur}px) saturate(1.25)`, fontFamily: settings.fontFamily,
  } as React.CSSProperties;

  const renderLine = (line: LyricsLine) => {
    const isActive = line.id === highlightedLineId;
    return <p key={line.id} ref={(element) => { lineRefs.current[line.id] = element; }} className={`line${isTimed ? "" : " plain"}${isActive ? " active" : ""}${!line.text ? " spacer" : ""}`} data-line-id={line.id} data-start-ms={isTimed ? line.startMs : undefined} onClick={(event) => { event.stopPropagation(); seekTo(line); }}>
      {line.words?.length ? line.words.map((word, wordIndex) => <span key={`${line.id}-${wordIndex}`} className={`word${isActive && timeMs >= word.endMs ? " sung" : ""}${isActive && timeMs >= word.startMs && timeMs < word.endMs ? " current" : ""}`}>{word.text}</span>) : line.text}
    </p>;
  };

  const manualSearch = <>
    <form className="search-form" onSubmit={search} onKeyDown={stopVideoShortcuts} onKeyUp={stopVideoShortcuts} onKeyPress={stopVideoShortcuts}><input aria-label="Buscar letra" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={stopVideoShortcuts} onKeyUp={stopVideoShortcuts} onKeyPress={stopVideoShortcuts} placeholder="artista - música" /><button className="primary" disabled={!query.trim() || loading}>Buscar</button></form>
    {candidates.length > 0 && <div className="candidate-list">{candidates.map((candidate) => <button className="candidate" key={candidate.id} onClick={() => void selectCandidate(candidate)}><span className="candidate-title">{candidate.trackName || candidate.name || "Faixa sem título"}</span><span className="candidate-meta">{candidate.artistName || "Artista desconhecido"}{candidate.duration ? ` · ${Math.round(candidate.duration)}s` : ""}</span></button>)}</div>}
  </>;

  return <div className={`panel${visible ? "" : " is-hidden"}`} style={panelStyle} aria-hidden={!visible} onKeyDown={onPanelKeyDown} onKeyUp={stopVideoShortcuts} onKeyPress={stopVideoShortcuts}>
    <header className="header" onPointerDown={(event) => beginPointer(event, "drag")}>
      <div className="brand"><div className="eyebrow">Refrão {record ? `· ${record.mode === "wordSynced" ? "palavra" : record.mode === "lineSynced" ? "linha" : "simples"}` : ""}</div><div className="song">{record?.trackName || metadata?.title || "Letras do YouTube"}</div><div className="artist">{record?.artistName || metadata?.artist || "Abra um vídeo musical para começar"}</div></div>
      <button className="icon-button" aria-label="Configurações" aria-pressed={settingsOpen} onPointerDown={(event) => event.stopPropagation()} onClick={() => { setSyncOpen(false); setSettingsOpen((open) => !open); }}>⚙</button>
      <button className="icon-button" aria-label="Fechar letras" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>×</button>
    </header>
    <div className="status"><span className={`badge${record?.mode === "wordSynced" || record?.mode === "lineSynced" ? " good" : ""}`}>{metadata?.isAd ? "Aguardando o vídeo" : loading ? (metadata ? "Buscando…" : "Carregando…") : record ? (record.mode === "instrumental" ? "Sem letra disponível" : record.mode === "plain" ? "Sem sincronização" : "Sincronizada") : "Aguardando"}</span><span>{metadata?.duration ? `${Math.floor(metadata.duration / 60)}:${String(Math.floor(metadata.duration % 60)).padStart(2, "0")}` : ""}</span></div>
    <div className="lyrics-scroll" ref={scrollRef} onWheel={cancelScrollAnimation} onScroll={() => { if (!drag && Date.now() > programmaticScrollUntil.current) setUserScrolled(true); }}>
      {storageError && <p className="error" role="alert">{storageError}</p>}
      {metadata?.isAd && <div className="empty-state"><strong>O anúncio está terminando</strong><p>A letra será buscada quando a duração real da música estiver disponível.</p></div>}
      {loading && !metadata?.isAd && <LoadingState metadata={metadata} />}
      {!loading && !error && record && record.mode === "instrumental" && <div className="empty-state"><strong>Letra não encontrada</strong><p>O LRCLIB não possui uma letra para esta gravação.</p></div>}
      {!loading && !error && record && record.mode !== "instrumental" && record.lines.map(renderLine)}
      {!loading && error && <div className="empty-state"><strong>Não foi possível carregar</strong><p className="error">{error}</p><p>Tente novamente ou faça uma busca manual.</p><div className="error-actions"><button className="primary retry" type="button" onClick={retryLookup}>Tentar novamente</button></div>{manualSearch}</div>}
      {!loading && !error && !record && <div className="empty-state"><strong>{selectionMode ? "Escolha outra letra" : "Encontre a letra certa"}</strong><p>{selectionMode ? "A seleção anterior foi liberada. Pesquise e escolha a gravação correta." : "Não houve uma correspondência segura automática. Pesquise por artista e música."}</p>{manualSearch}</div>}
      {userScrolled && settings.autoScroll && isTimed && <button className="resume" onClick={() => { setUserScrolled(false); if (centerIndex >= 0) centerActiveLine(centerIndex); }}>Retomar sincronização</button>}
    </div>
    <footer className="footer">
      <span>{record?.artistName || "LRCLIB"}</span>
      <div className="footer-actions">
        {record && !loading && <button className="change-lyrics" type="button" onClick={() => void changeLyrics()}>Trocar letra</button>}
        {selectionMode && !record && !loading && <button className="change-lyrics" type="button" onClick={cancelChangeLyrics}>Cancelar</button>}
        <div className="sync-control" ref={syncControlRef}>
        {syncOpen && <div className="sync-popover" role="dialog" aria-label="Ajustar sincronização">
          <div className="sync-popover-header">
            <div><strong>Sincronização desta música</strong><span>{offsetStatus(videoOffsetMs)}</span></div>
            <button className="sync-close" type="button" aria-label="Fechar ajuste de sincronização" onClick={() => setSyncOpen(false)}>×</button>
          </div>
          <div className="sync-stepper">
            <button className="sync-step-button" type="button" aria-label="Atrasar letra em 100 milissegundos" title="Segure para atrasar continuamente" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); startOffsetHold(-OFFSET_STEP_MS); }} onPointerUp={stopOffsetHold} onPointerCancel={stopOffsetHold} onLostPointerCapture={stopOffsetHold} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) { event.preventDefault(); startOffsetHold(-OFFSET_STEP_MS); } }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") stopOffsetHold(); }} onBlur={stopOffsetHold}><strong>−100 ms</strong><span>Atrasar</span></button>
            <div className="sync-offset-value" aria-live="polite"><strong>{formatOffset(videoOffsetMs)}</strong><span>ajuste atual</span></div>
            <button className="sync-step-button" type="button" aria-label="Adiantar letra em 100 milissegundos" title="Segure para adiantar continuamente" onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); startOffsetHold(OFFSET_STEP_MS); }} onPointerUp={stopOffsetHold} onPointerCancel={stopOffsetHold} onLostPointerCapture={stopOffsetHold} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) { event.preventDefault(); startOffsetHold(OFFSET_STEP_MS); } }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") stopOffsetHold(); }} onBlur={stopOffsetHold}><strong>+100 ms</strong><span>Adiantar</span></button>
          </div>
          <div className="sync-popover-footer">
            <span>Ajuste até o verso acompanhar a voz.</span>
            {videoOffsetMs !== 0 && <button className="sync-reset-action" type="button" onClick={() => setOffset(0)}>Zerar ajuste</button>}
          </div>
        </div>}
        <button className={`sync-trigger${videoOffsetMs !== 0 ? " is-adjusted" : ""}`} type="button" aria-label="Ajustar sincronização" aria-haspopup="dialog" aria-expanded={syncOpen} title={`Ajuste atual: ${offsetDescription(videoOffsetMs)}`} onClick={() => setSyncOpen((open) => !open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" /></svg>
          <span>Sincronia</span>
          {videoOffsetMs !== 0 && <strong>{formatOffset(videoOffsetMs)}</strong>}
        </button>
        </div>
      </div>
    </footer>
    <div className="resize-handle" role="button" aria-label="Redimensionar painel" onPointerDown={(event) => beginPointer(event, "resize")} />
    {settingsOpen && <SettingsDrawer settings={settings} update={updateSettings} offsetMs={videoOffsetMs} onOffsetChange={setOffset} onClose={() => setSettingsOpen(false)} />}
  </div>;
}
