export const panelStyles = `
:host { all: initial; color-scheme: dark; }
* { box-sizing: border-box; }
.panel {
  --accent: #fff;
  --muted: rgba(255,255,255,.48);
  position: fixed;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 320px;
  min-height: 360px;
  color: #fff;
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: linear-gradient(140deg, rgba(38,38,46,.92), rgba(13,13,18,.84));
  border: 1px solid rgba(255,255,255,.14);
  border-radius: 22px;
  box-shadow: 0 26px 80px rgba(0,0,0,.45), inset 0 1px rgba(255,255,255,.12);
  backdrop-filter: blur(20px) saturate(1.25);
  pointer-events: auto;
  user-select: none;
}
.panel.is-hidden { display: none; }
.header { display: flex; align-items: center; gap: 10px; padding: 16px 16px 12px; cursor: grab; flex: 0 0 auto; }
.header:active { cursor: grabbing; }
.brand { min-width: 0; flex: 1; }
.eyebrow { color: var(--muted); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; }
.song { margin-top: 3px; overflow: hidden; font-size: 15px; line-height: 1.25; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.artist { margin-top: 2px; overflow: hidden; color: var(--muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.icon-button { width: 30px; height: 30px; display: inline-grid; place-items: center; flex: 0 0 auto; border: 0; border-radius: 10px; color: rgba(255,255,255,.72); background: transparent; cursor: pointer; font: inherit; }
.icon-button:hover, .icon-button[aria-pressed="true"] { color: #fff; background: rgba(255,255,255,.12); }
.status { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 27px; padding: 0 16px 8px; color: var(--muted); font-size: 11px; }
.badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 999px; background: rgba(255,255,255,.08); }
.badge.good { color: #b8f7cf; background: rgba(90, 220, 135, .12); }
.badge.warn { color: #ffd28a; background: rgba(255, 184, 62, .12); }
.lyrics-scroll { position: relative; flex: 1 1 auto; overflow: auto; padding: 18px 18px 80px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.24) transparent; }
.lyrics-scroll::-webkit-scrollbar { width: 7px; }
.lyrics-scroll::-webkit-scrollbar-thumb { border-radius: 10px; background: rgba(255,255,255,.22); }
.line { position: relative; margin: 0; padding: 8px 4px; color: var(--inactive-color); opacity: var(--inactive-opacity); font-size: var(--font-size); font-weight: var(--font-weight); line-height: var(--line-height); text-align: var(--text-align); white-space: pre-wrap; cursor: pointer; transform: scale(.96); transform-origin: left center; will-change: opacity, transform, color, filter; transition: opacity 320ms cubic-bezier(.22,1,.36,1), transform 320ms cubic-bezier(.22,1,.36,1), color 260ms ease, filter 260ms ease; }
.line:hover { opacity: .78; }
.line.plain { opacity: .8; transform: none; cursor: text; }
.line.active { color: var(--active-color); opacity: 1; transform: scale(1); filter: drop-shadow(0 0 calc(16px * var(--intensity)) rgba(255,255,255,.18)); animation: lyric-ignite 440ms cubic-bezier(.22,1,.36,1) both; }
.line.spacer { min-height: 28px; cursor: default; }
.word { transition: color 90ms linear, text-shadow 160ms ease; }
.word.sung { color: var(--active-color); text-shadow: 0 0 14px rgba(255,255,255,.28); }
.word.current { text-shadow: 0 0 20px rgba(255,255,255,.6); }
@keyframes lyric-ignite {
  0% { opacity: .55; transform: scale(.975); filter: brightness(.82) drop-shadow(0 0 0 rgba(255,255,255,0)); text-shadow: 0 0 0 rgba(255,255,255,0); }
  48% { opacity: 1; transform: scale(1.018); filter: brightness(1.28) drop-shadow(0 0 calc(26px * var(--intensity)) rgba(255,255,255,.42)); text-shadow: 0 0 calc(18px * var(--intensity)) rgba(255,255,255,.45); }
  100% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 calc(16px * var(--intensity)) rgba(255,255,255,.18)); text-shadow: none; }
}
.empty-state { display: grid; align-content: center; min-height: 100%; gap: 12px; padding: 24px 10px; color: rgba(255,255,255,.7); text-align: center; }
.empty-state strong { color: #fff; font-size: 17px; }
.empty-state p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.loading-state { position: relative; isolation: isolate; overflow: hidden; }
.loading-state::before { content: ""; position: absolute; top: 50%; left: 50%; z-index: -1; width: 190px; height: 150px; border-radius: 50%; background: radial-gradient(ellipse, rgba(117, 196, 255, .2), rgba(117, 196, 255, 0) 68%); filter: blur(16px); transform: translate(-50%, -58%); animation: loading-breathe 2.6s ease-in-out infinite; }
.loading-art { position: relative; width: 190px; height: 142px; margin: 0 auto 2px; }
.loading-art::after { content: ""; position: absolute; top: 18px; right: 20px; bottom: 34px; left: 20px; border-radius: 50%; background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.16) 50%, transparent 65%); opacity: .5; transform: translateX(-120%); animation: loading-sheen 2.8s ease-in-out infinite; }
.loading-orbit { position: absolute; display: block; border: 1px solid rgba(152, 218, 255, .32); border-radius: 50%; transform-origin: center; animation: loading-orbit 3.2s ease-in-out infinite; }
.loading-orbit-a { inset: 13px 39px 33px; border-top-color: rgba(255,255,255,.88); transform: rotate(-17deg); }
.loading-orbit-b { inset: 23px 23px 23px; border-right-color: rgba(112, 204, 255, .8); animation-delay: -.9s; animation-duration: 4.1s; }
.loading-note { position: absolute; top: 22px; left: 50%; z-index: 1; color: rgba(255,255,255,.94); font-size: 48px; line-height: 1; text-shadow: 0 0 22px rgba(137, 217, 255, .7); transform: translateX(-50%) rotate(-8deg); animation: loading-note-float 2.2s ease-in-out infinite; }
.loading-note-alt { top: 12px; left: auto; right: 35px; color: rgba(152, 220, 255, .74); font-size: 22px; text-shadow: 0 0 14px rgba(137, 217, 255, .55); animation-delay: -.7s; }
.loading-lyrics { position: absolute; right: 24px; bottom: 44px; left: 24px; display: grid; gap: 7px; }
.loading-lyric { display: block; height: 7px; border-radius: 999px; background: linear-gradient(90deg, rgba(255,255,255,.2), rgba(181,230,255,.88), rgba(255,255,255,.2)); box-shadow: 0 0 12px rgba(128, 211, 255, .2); transform-origin: left center; animation: loading-lyric 2s cubic-bezier(.22,1,.36,1) infinite; }
.loading-lyric-one { width: 88%; }
.loading-lyric-two { width: 66%; animation-delay: -.45s; }
.loading-lyric-three { width: 76%; animation-delay: -.9s; }
.loading-wave { position: absolute; right: 43px; bottom: 14px; left: 43px; display: flex; align-items: end; justify-content: center; gap: 5px; height: 22px; }
.loading-wave span { display: block; width: 4px; height: 9px; border-radius: 999px; background: rgba(180, 230, 255, .82); box-shadow: 0 0 10px rgba(109, 205, 255, .4); animation: loading-wave 1.1s ease-in-out infinite; }
.loading-wave span:nth-child(2) { animation-delay: -.18s; }
.loading-wave span:nth-child(3) { animation-delay: -.36s; }
.loading-wave span:nth-child(4) { animation-delay: -.54s; }
.loading-wave span:nth-child(5) { animation-delay: -.72s; }
.loading-wave span:nth-child(6) { animation-delay: -.9s; }
.loading-wave span:nth-child(7) { animation-delay: -1.08s; }
@keyframes loading-breathe { 0%, 100% { opacity: .48; transform: translate(-50%, -58%) scale(.86); } 50% { opacity: .9; transform: translate(-50%, -58%) scale(1.12); } }
@keyframes loading-sheen { 0%, 20% { transform: translateX(-120%); opacity: 0; } 45% { opacity: .72; } 75%, 100% { transform: translateX(120%); opacity: 0; } }
@keyframes loading-orbit { 0%, 100% { opacity: .45; transform: scale(.92) rotate(-8deg); } 50% { opacity: .95; transform: scale(1.06) rotate(9deg); } }
@keyframes loading-note-float { 0%, 100% { transform: translate(-50%, 4px) rotate(-9deg); } 50% { transform: translate(-50%, -7px) rotate(6deg); } }
@keyframes loading-lyric { 0%, 100% { opacity: .22; transform: scaleX(.72); } 48% { opacity: .92; transform: scaleX(1); } }
@keyframes loading-wave { 0%, 100% { height: 6px; opacity: .4; } 50% { height: 22px; opacity: 1; } }
.search-form { display: flex; gap: 7px; margin-top: 8px; }
.search-form input { min-width: 0; flex: 1; padding: 10px 11px; border: 1px solid rgba(255,255,255,.14); border-radius: 10px; outline: none; color: #fff; background: rgba(0,0,0,.2); font: inherit; }
.search-form input:focus { border-color: rgba(255,255,255,.5); }
.primary { padding: 0 12px; border: 0; border-radius: 10px; color: #16161b; background: #fff; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
.primary:disabled { cursor: wait; opacity: .55; }
.candidate-list { display: grid; gap: 7px; max-height: 230px; overflow: auto; margin-top: 12px; text-align: left; }
.candidate { display: block; width: 100%; padding: 10px; border: 1px solid rgba(255,255,255,.1); border-radius: 11px; color: #fff; background: rgba(255,255,255,.06); text-align: left; cursor: pointer; }
.candidate:hover { background: rgba(255,255,255,.14); }
.candidate-title { display: block; overflow: hidden; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.candidate-meta { display: block; margin-top: 3px; overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.resume { position: sticky; bottom: 18px; display: block; width: max-content; margin: -52px auto 0; padding: 8px 13px; border: 1px solid rgba(255,255,255,.16); border-radius: 999px; color: #fff; background: rgba(30,30,38,.86); box-shadow: 0 10px 30px rgba(0,0,0,.25); backdrop-filter: blur(10px); cursor: pointer; font: inherit; font-size: 12px; }
.footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex: 0 0 auto; padding: 9px 16px 13px; color: var(--muted); font-size: 11px; }
.footer > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sync-control { position: relative; display: inline-flex; flex: 0 0 auto; }
.sync-trigger { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 8px; border: 1px solid rgba(255,255,255,.1); border-radius: 999px; color: rgba(255,255,255,.58); background: rgba(255,255,255,.045); cursor: pointer; font: inherit; font-size: 10px; transition: border-color 140ms ease, background 140ms ease, color 140ms ease; }
.sync-trigger svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
.sync-trigger strong { padding-left: 5px; border-left: 1px solid rgba(255,255,255,.12); color: rgba(255,255,255,.86); font-size: 9px; font-variant-numeric: tabular-nums; }
.sync-trigger:hover, .sync-trigger:focus-visible, .sync-trigger[aria-expanded="true"] { border-color: rgba(255,255,255,.26); color: #fff; background: rgba(255,255,255,.1); outline: none; }
.sync-trigger.is-adjusted { border-color: rgba(128,213,176,.28); color: rgba(183,239,212,.9); background: rgba(75,175,128,.1); }
.sync-popover { position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 5; width: 258px; padding: 11px; border: 1px solid rgba(255,255,255,.13); border-radius: 13px; color: #fff; background: rgba(22,22,29,.97); box-shadow: 0 16px 42px rgba(0,0,0,.42), 0 0 0 1px rgba(0,0,0,.22); backdrop-filter: blur(20px) saturate(1.2); transform-origin: bottom right; animation: sync-popover-in 160ms cubic-bezier(.2,.8,.2,1); }
.sync-popover::after { content: ""; position: absolute; right: 21px; bottom: -5px; width: 8px; height: 8px; border-right: 1px solid rgba(255,255,255,.13); border-bottom: 1px solid rgba(255,255,255,.13); background: rgba(22,22,29,.97); transform: rotate(45deg); }
.sync-popover-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.sync-popover-header > div { display: grid; gap: 3px; }
.sync-popover-header strong { font-size: 12px; letter-spacing: .01em; }
.sync-popover-header span { color: rgba(255,255,255,.48); font-size: 9px; }
.sync-close { display: grid; width: 21px; height: 21px; padding: 0; border: 0; border-radius: 50%; place-items: center; color: rgba(255,255,255,.55); background: transparent; cursor: pointer; font: inherit; font-size: 15px; line-height: 1; }
.sync-close:hover, .sync-close:focus-visible { color: #fff; background: rgba(255,255,255,.1); outline: none; }
.sync-stepper { display: grid; grid-template-columns: 1fr 76px 1fr; align-items: stretch; gap: 5px; margin-top: 10px; }
.sync-step-button { display: grid; gap: 2px; min-width: 0; padding: 6px 3px; border: 1px solid rgba(255,255,255,.1); border-radius: 8px; color: rgba(255,255,255,.76); background: rgba(255,255,255,.045); cursor: pointer; font: inherit; text-align: center; transition: transform 100ms ease, border-color 140ms ease, background 140ms ease; }
.sync-step-button strong { font-size: 10px; font-variant-numeric: tabular-nums; }
.sync-step-button span { color: rgba(255,255,255,.4); font-size: 8px; }
.sync-step-button:hover, .sync-step-button:focus-visible { border-color: rgba(255,255,255,.28); color: #fff; background: rgba(255,255,255,.11); outline: none; }
.sync-step-button:active { transform: scale(.97); }
.sync-offset-value { display: grid; align-content: center; gap: 1px; border-radius: 8px; color: #fff; background: rgba(255,255,255,.075); text-align: center; }
.sync-offset-value strong { font-size: 12px; font-variant-numeric: tabular-nums; }
.sync-offset-value span { color: rgba(255,255,255,.36); font-size: 7px; letter-spacing: .04em; text-transform: uppercase; }
.sync-popover-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 20px; margin-top: 7px; }
.sync-popover-footer > span { color: rgba(255,255,255,.36); font-size: 8px; line-height: 1.3; }
.sync-reset-action { flex: 0 0 auto; padding: 3px 6px; border: 0; border-radius: 6px; color: rgba(188,232,214,.84); background: rgba(83,180,138,.1); cursor: pointer; font: inherit; font-size: 8px; }
.sync-reset-action:hover, .sync-reset-action:focus-visible { color: #fff; background: rgba(83,180,138,.2); outline: none; }
@keyframes sync-popover-in { from { opacity: 0; transform: translateY(5px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.settings { position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column; background: rgba(21,21,27,.97); backdrop-filter: blur(28px); }
.settings-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid rgba(255,255,255,.1); }
.settings-header strong { font-size: 15px; }
.settings-scroll { overflow: auto; padding: 14px 16px 24px; }
.control { display: grid; gap: 6px; margin-bottom: 15px; }
.control-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.control label, .control-row label { color: rgba(255,255,255,.76); font-size: 12px; }
.value { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.control select, .control input[type="color"] { width: 100%; min-height: 32px; padding: 6px 8px; border: 1px solid rgba(255,255,255,.16); border-radius: 9px; color: #fff; background: rgba(255,255,255,.08); font: inherit; }
.control select option { color: #fff; background-color: #22222b; }
.control input[type="color"] { padding: 2px; }
.control input[type="range"] { width: 100%; accent-color: #fff; }
.offset-hint { color: rgba(255,255,255,.38); font-size: 10px; }
.toggle { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toggle input { width: 36px; height: 20px; accent-color: #fff; }
.resize-handle { position: absolute; right: 4px; bottom: 4px; width: 18px; height: 18px; cursor: nwse-resize; opacity: .5; }
.resize-handle::after { content: ""; position: absolute; right: 2px; bottom: 2px; width: 9px; height: 9px; border-right: 2px solid #fff; border-bottom: 2px solid #fff; }
.error { color: #ffb4b4; font-size: 12px; }
.error-actions { display: flex; justify-content: center; margin-top: 2px; }
.retry { min-height: 32px; }
.footer-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; }
.change-lyrics { flex: 0 0 auto; padding: 5px 7px; border: 1px solid rgba(255,255,255,.12); border-radius: 8px; color: rgba(255,255,255,.62); background: rgba(255,255,255,.045); cursor: pointer; font: inherit; font-size: 9px; transition: color 140ms ease, border-color 140ms ease, background 140ms ease; }
.change-lyrics:hover, .change-lyrics:focus-visible { border-color: rgba(255,255,255,.28); color: #fff; background: rgba(255,255,255,.1); outline: none; }
@media (prefers-reduced-motion: reduce) {
  .line, .word { transition-duration: 0.01ms; }
  .line.active { animation: none; }
  .loading-state::before, .loading-art::after, .loading-art *, .loading-art span { animation: none; }
  .sync-popover { animation: none; }
}
`;
