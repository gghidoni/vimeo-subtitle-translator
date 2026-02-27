const DEFAULT_SETTINGS = {
  enabled: true,
  targetLang: "it",
  displayMode: "both",
  hideNative: true,
  fontSize: 32,
  position: null
};

const ENABLED_CLASS = "lc-subtitle-translator-enabled";
const HIDE_NATIVE_CLASS = "lc-subtitle-translator-hide-native";
const DISPLAY_MODES = new Set(["both", "translated", "original"]);

const CAPTION_SELECTORS = [
  ".vjs-text-track-display",
  ".vjs-text-track-cue",
  "[class*='caption']",
  "[class*='subtitle']",
  "[data-testid*='caption']"
];

const state = {
  settings: { ...DEFAULT_SETTINGS },
  currentVideo: null,
  currentTrack: null,
  originalTrackModes: new WeakMap(),
  videoListeners: [],
  trackList: null,
  lastSourceText: "",
  observer: null,
  cache: new Map(),
  translateToken: 0,
  drag: null,
  overlayTextEl: null,
  positionTimer: null,
  attachTimer: null,
  trackPollTimer: null,
  hiddenCaptionNodes: new Map(),
  settingsRefreshTimer: null,
  settingsRefreshBusy: false
};

init().catch((error) => {
  console.error("[Subtitle Translator] Init error", error);
});

async function init() {
  state.settings = normalizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
  emergencyRestorePageVisibility();
  installStyles();
  ensureOverlay();
  applyEnabledClass();
  observeDom();
  watchSettingsChanges();
  attachToBestVideo();
  updateOverlayPosition();

  state.attachTimer = setInterval(attachToBestVideo, 1200);
  state.positionTimer = setInterval(updateOverlayPosition, 250);
  state.settingsRefreshTimer = setInterval(refreshSettingsFromStorage, 1200);
}

function normalizeSettings(raw) {
  const fontSize = Number(raw.fontSize);
  const parsedFontSize = Number.isFinite(fontSize) ? Math.min(72, Math.max(16, fontSize)) : DEFAULT_SETTINGS.fontSize;

  const position =
    raw.position && Number.isFinite(raw.position.xPct) && Number.isFinite(raw.position.yPct)
      ? {
          xPct: clamp(raw.position.xPct, 0.05, 0.95),
          yPct: clamp(raw.position.yPct, 0.05, 0.95)
        }
      : null;

  const candidateMode = String(raw.displayMode || DEFAULT_SETTINGS.displayMode);
  const displayMode = DISPLAY_MODES.has(candidateMode) ? candidateMode : DEFAULT_SETTINGS.displayMode;

  return {
    enabled: Boolean(raw.enabled),
    targetLang: String(raw.targetLang || DEFAULT_SETTINGS.targetLang),
    displayMode,
    hideNative: raw.hideNative == null ? DEFAULT_SETTINGS.hideNative : Boolean(raw.hideNative),
    fontSize: parsedFontSize,
    position
  };
}

function watchSettingsChanges() {
  chrome.storage.sync.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }

    const next = { ...state.settings };
    for (const [key, value] of Object.entries(changes)) {
      next[key] = value.newValue;
    }

    state.settings = normalizeSettings(next);
    applySettingsChange();
  });
}

async function refreshSettingsFromStorage() {
  if (state.settingsRefreshBusy) {
    return;
  }

  state.settingsRefreshBusy = true;
  try {
    const latest = normalizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
    if (!areSettingsEqual(state.settings, latest)) {
      state.settings = latest;
      applySettingsChange();
    }
  } catch (_error) {
    console.debug("[Subtitle Translator] Could not refresh settings from storage");
  } finally {
    state.settingsRefreshBusy = false;
  }
}

function applySettingsChange() {
  state.lastSourceText = "";
  state.translateToken += 1;

  applyEnabledClass();

  if (!state.settings.enabled) {
    restoreNativeCaptions();
    document.documentElement.classList.remove(HIDE_NATIVE_CLASS);
    restoreTrackModes(state.currentVideo?.textTracks);
    detachCurrentTrack();
    renderSubtitle("");
    return;
  }

  if (state.currentTrack) {
    setTrackRenderingModeForCurrentSettings(state.currentTrack);
  }

  updateOverlayPosition();
  onCueChange();
}

function areSettingsEqual(a, b) {
  return (
    a.enabled === b.enabled &&
    a.targetLang === b.targetLang &&
    a.displayMode === b.displayMode &&
    a.hideNative === b.hideNative &&
    a.fontSize === b.fontSize &&
    serializePosition(a.position) === serializePosition(b.position)
  );
}

function serializePosition(position) {
  if (!position) {
    return "none";
  }
  return `${position.xPct}:${position.yPct}`;
}

function observeDom() {
  if (state.observer) {
    return;
  }

  state.observer = new MutationObserver(() => {
    attachToBestVideo();
  });

  state.observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}

function attachToBestVideo() {
  const video = findBestVideo();
  if (!video || state.currentVideo === video) {
    return;
  }

  detachVideoBindings();
  state.currentVideo = video;
  state.lastSourceText = "";
  state.translateToken += 1;
  renderSubtitle("");
  bindVideo(video);
  updateOverlayPosition();
}

function bindVideo(video) {
  const onLoadedMetadata = () => selectAndBindTrack();
  const onEmptied = () => {
    detachCurrentTrack();
    renderSubtitle("");
  };

  video.addEventListener("loadedmetadata", onLoadedMetadata);
  video.addEventListener("emptied", onEmptied);
  state.videoListeners.push({ target: video, type: "loadedmetadata", handler: onLoadedMetadata });
  state.videoListeners.push({ target: video, type: "emptied", handler: onEmptied });

  if (video.textTracks && typeof video.textTracks.addEventListener === "function") {
    const onTrackListChanged = () => selectAndBindTrack();
    video.textTracks.addEventListener("addtrack", onTrackListChanged);
    video.textTracks.addEventListener("change", onTrackListChanged);
    state.videoListeners.push({ target: video.textTracks, type: "addtrack", handler: onTrackListChanged });
    state.videoListeners.push({ target: video.textTracks, type: "change", handler: onTrackListChanged });
    state.trackList = video.textTracks;
  }

  selectAndBindTrack();
  state.trackPollTimer = setInterval(() => {
    if (state.currentVideo !== video) {
      return;
    }
    selectAndBindTrack();
  }, 800);
}

function detachVideoBindings() {
  if (state.trackPollTimer) {
    clearInterval(state.trackPollTimer);
    state.trackPollTimer = null;
  }

  for (const listener of state.videoListeners) {
    listener.target.removeEventListener(listener.type, listener.handler);
  }
  state.videoListeners = [];
  state.trackList = null;
  detachCurrentTrack();
}

function selectAndBindTrack() {
  if (!state.currentVideo) {
    return;
  }

  if (!state.settings.enabled) {
    return;
  }

  // Some players don't create/populate tracks until they're enabled.
  // Try to nudge any existing <track> elements for the current video.
  if ((state.currentVideo.textTracks?.length || 0) === 0) {
    tryActivateTrackElements(state.currentVideo);
  }

  const track = chooseSubtitleTrack(state.currentVideo.textTracks);
  if (!track) {
    return;
  }

  enforceTrackModes(state.currentVideo.textTracks, track);

  if (track === state.currentTrack) {
    return;
  }

  bindTrack(track);
}

function chooseSubtitleTrack(trackList) {
  const tracks = Array.from(trackList || []).filter((track) => track.kind === "subtitles" || track.kind === "captions");
  if (!tracks.length) {
    return null;
  }

  const activelyShowing = tracks.find((track) => track.mode === "showing");
  if (activelyShowing) {
    return activelyShowing;
  }

  const activeButHidden = tracks.find((track) => track.mode === "hidden");
  if (activeButHidden) {
    return activeButHidden;
  }

  const withCues = tracks.find((track) => track.cues && track.cues.length > 0);
  if (withCues) {
    return withCues;
  }

  const english = tracks.find((track) => {
    const label = String(track.label || "").toLowerCase();
    const lang = String(track.language || "").toLowerCase();
    return lang.startsWith("en") || label.includes("english") || label.includes("en ") || label === "en";
  });
  if (english) {
    return english;
  }

  return tracks[0];
}

function bindTrack(track) {
  detachCurrentTrack();
  state.currentTrack = track;

  track.addEventListener("cuechange", onCueChange);
  onCueChange();
}

function enforceTrackModes(trackList, activeTrack) {
  const tracks = Array.from(trackList || []).filter((track) => track.kind === "subtitles" || track.kind === "captions");
  if (!tracks.length) {
    return;
  }

  if (!activeTrack) {
    return;
  }

  try {
    rememberOriginalTrackMode(activeTrack);
    setTrackRenderingModeForCurrentSettings(activeTrack);
  } catch (_error) {
    console.debug("[Subtitle Translator] Could not enforce active track mode");
  }
}

function setTrackRenderingModeForCurrentSettings(track) {
  if (!track) {
    return;
  }

  const hasCues = Boolean(track.cues && track.cues.length > 0);
  const hasActive = Boolean(track.activeCues && track.activeCues.length > 0);

  // Keep native captions visible when user asked so.
  if (!state.settings.hideNative) {
    if (track.mode !== "showing") {
      track.mode = "showing";
    }
    return;
  }

  // First warm up cues with `showing`; once cues exist, switch to `hidden`.
  const desiredMode = hasCues || hasActive ? "hidden" : "showing";
  if (track.mode !== desiredMode) {
    track.mode = desiredMode;
  }
}

function tryActivateTrackElements(video) {
  try {
    const els = Array.from(video.querySelectorAll('track[kind="subtitles"], track[kind="captions"]'));
    for (const el of els) {
      try {
        // Hint to browser/player this track is desired.
        if (!el.default) {
          el.default = true;
        }
        if (el.track && el.track.mode !== "showing") {
          el.track.mode = "showing";
        }
      } catch (_error) {
        // ignore per-element
      }
    }
  } catch (_error) {
    // ignore
  }
}

function rememberOriginalTrackMode(track) {
  if (state.originalTrackModes.has(track)) {
    return;
  }
  state.originalTrackModes.set(track, track.mode);
}

function restoreTrackModes(trackList) {
  const tracks = Array.from(trackList || []).filter((track) => track.kind === "subtitles" || track.kind === "captions");
  for (const track of tracks) {
    const original = state.originalTrackModes.get(track);
    if (original == null) {
      continue;
    }
    try {
      track.mode = original;
    } catch (_error) {
      console.debug("[Subtitle Translator] Could not restore track mode");
    }
  }
}

function detachCurrentTrack() {
  if (state.currentTrack) {
    state.currentTrack.removeEventListener("cuechange", onCueChange);
  }
  state.currentTrack = null;
}

async function onCueChange() {
  if (!state.settings.enabled) {
    renderSubtitle("");
    return;
  }

  const sourceText = getCurrentSourceText();
  if (!sourceText) {
    state.lastSourceText = "";
    renderSubtitle("");
    return;
  }

  if (sourceText === state.lastSourceText && state.settings.displayMode === "original") {
    return;
  }

  state.lastSourceText = sourceText;

  if (state.currentTrack) {
    try {
      setTrackRenderingModeForCurrentSettings(state.currentTrack);
    } catch (_error) {
      // ignore mode toggles errors
    }
  }

  if (state.settings.hideNative) {
    hideNativeCaptionsNearVideoByText(sourceText);
  }

  if (state.settings.displayMode === "original") {
    renderPair(sourceText, "");
    return;
  }

  const token = ++state.translateToken;

  try {
    const translatedText = await translateWithCache(sourceText, state.settings.targetLang);
    if (token !== state.translateToken) {
      return;
    }
    renderPair(sourceText, translatedText);
  } catch (_error) {
    if (token !== state.translateToken) {
      return;
    }
    renderPair(sourceText, "");
  }
}

function getCurrentSourceText() {
  const trackText = readTrackCueText();
  if (trackText) {
    return trackText;
  }

  return readDomCaptionText();
}

function readTrackCueText() {
  if (!state.currentTrack) {
    return "";
  }

  const activeCues = Array.from(state.currentTrack.activeCues || []);
  if (!activeCues.length) {
    return "";
  }

  const lines = activeCues.map((cue) => normalizeCueText(cue.text || "")).filter(Boolean);
  return lines.join("\n").trim();
}

function readDomCaptionText() {
  if (!state.currentVideo) {
    return "";
  }

  const videoRect = state.currentVideo.getBoundingClientRect();
  if (videoRect.width < 120 || videoRect.height < 80) {
    return "";
  }

  const selector = CAPTION_SELECTORS.join(",");
  const nodes = queryAllDeep(selector);
  let bestText = "";
  let bestScore = -1;

  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }

    const text = normalizeCueText(node.innerText || node.textContent || "");
    if (!text || text.length > 220) {
      continue;
    }

    const rect = node.getBoundingClientRect();
    if (!isRectVisible(rect)) {
      continue;
    }

    if (!rectIntersects(rect, videoRect)) {
      continue;
    }

    const centerY = rect.top + rect.height / 2;
    if (centerY < videoRect.top + videoRect.height * 0.45) {
      continue;
    }

    const area = rect.width * rect.height;
    const distancePenalty = Math.abs(videoRect.bottom - centerY) * 12;
    const score = area - distancePenalty;
    if (score > bestScore) {
      bestScore = score;
      bestText = text;
    }
  }

  return bestText;
}

function normalizeCueText(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function translateWithCache(text, targetLang) {
  const key = `${targetLang}::${text}`;
  if (state.cache.has(key)) {
    return state.cache.get(key);
  }

  const translatedText = await requestTranslation(text, targetLang);
  state.cache.set(key, translatedText);

  if (state.cache.size > 700) {
    const oldestKey = state.cache.keys().next().value;
    state.cache.delete(oldestKey);
  }

  return translatedText;
}

function requestTranslation(text, targetLang) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "TRANSLATE_TEXT",
        text,
        targetLang
      },
      (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(runtimeError.message);
          return;
        }

        if (!response?.ok) {
          reject(response?.error || "Unknown translation error");
          return;
        }

        resolve(String(response.translatedText || ""));
      }
    );
  });
}

function renderPair(sourceText, translatedText) {
  if (!state.settings.enabled) {
    renderSubtitle("");
    return;
  }

  if (state.settings.displayMode === "original") {
    renderSubtitle(sourceText);
    return;
  }

  if (state.settings.displayMode === "translated") {
    renderSubtitle(translatedText || sourceText);
    return;
  }

  const text = translatedText ? `${translatedText}\n${sourceText}` : sourceText;
  renderSubtitle(text);
}

function renderSubtitle(text) {
  const overlay = ensureOverlay();
  if (!overlay || !state.overlayTextEl) {
    return;
  }

  state.overlayTextEl.textContent = text;
  overlay.style.opacity = text ? "1" : "0";
  updateOverlayPosition();
}

function ensureOverlay() {
  let overlay = document.getElementById("lc-subtitle-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "lc-subtitle-overlay";

    const handle = document.createElement("button");
    handle.type = "button";
    handle.id = "lc-subtitle-drag";
    handle.title = "Drag subtitles";
    handle.textContent = "drag";
    handle.addEventListener("pointerdown", onDragStart);

    const text = document.createElement("div");
    text.id = "lc-subtitle-text";

    overlay.appendChild(handle);
    overlay.appendChild(text);
    document.body.appendChild(overlay);
    state.overlayTextEl = text;
  }

  return overlay;
}

function onDragStart(event) {
  if (event.button !== 0) {
    return;
  }

  const overlay = ensureOverlay();
  const rect = overlay.getBoundingClientRect();
  state.drag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };

  overlay.dataset.dragging = "true";
  event.target.setPointerCapture(event.pointerId);
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  window.addEventListener("pointercancel", onDragEnd);
  event.preventDefault();
}

function onDragMove(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) {
    return;
  }

  const overlay = ensureOverlay();
  const centerX = event.clientX - state.drag.offsetX + overlay.offsetWidth / 2;
  const centerY = event.clientY - state.drag.offsetY + overlay.offsetHeight / 2;

  state.settings.position = {
    xPct: clamp(centerX / window.innerWidth, 0.05, 0.95),
    yPct: clamp(centerY / window.innerHeight, 0.05, 0.95)
  };

  updateOverlayPosition();
}

function onDragEnd(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) {
    return;
  }

  const overlay = ensureOverlay();
  delete overlay.dataset.dragging;

  const latestPosition = state.settings.position;
  state.drag = null;
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  window.removeEventListener("pointercancel", onDragEnd);

  chrome.storage.sync.set({ position: latestPosition }).catch((_error) => {
    console.debug("[Subtitle Translator] Could not save subtitle position");
  });
}

function updateOverlayPosition() {
  const overlay = ensureOverlay();
  if (!overlay) {
    return;
  }

  applyNativeCaptionsVisibility();

  overlay.style.fontSize = `${state.settings.fontSize}px`;

  const layout = resolveOverlayLayout();
  overlay.style.left = `${Math.round(layout.x)}px`;
  overlay.style.top = `${Math.round(layout.y)}px`;
  overlay.style.width = `${Math.round(layout.width)}px`;
}

function resolveOverlayLayout() {
  const position = state.settings.position;
  const videoRect = getVideoRect();
  const baseWidth = videoRect ? Math.min(videoRect.width, window.innerWidth * 0.92) : window.innerWidth * 0.92;
  const width = Math.max(240, baseWidth);

  if (position) {
    return {
      x: position.xPct * window.innerWidth,
      y: position.yPct * window.innerHeight,
      width
    };
  }

  if (videoRect) {
    const bottomOffset = Math.max(36, videoRect.height * 0.14);
    return {
      x: videoRect.left + videoRect.width / 2,
      y: videoRect.bottom - bottomOffset,
      width
    };
  }

  return {
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.82,
    width
  };
}

function getVideoRect() {
  if (!state.currentVideo || !state.currentVideo.isConnected) {
    return null;
  }

  const rect = state.currentVideo.getBoundingClientRect();
  if (!isRectVisible(rect)) {
    return null;
  }

  return rect;
}

function installStyles() {
  if (document.getElementById("lc-subtitle-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "lc-subtitle-style";
  style.textContent = `
    #lc-subtitle-overlay {
      position: fixed;
      z-index: 2147483646;
      transform: translate(-50%, -50%);
      text-align: center;
      width: min(92vw, 1200px);
      box-sizing: border-box;
      opacity: 0;
      transition: opacity 120ms linear;
      pointer-events: none;
    }

    #lc-subtitle-text {
      white-space: pre-line;
      line-height: 1.32;
      color: #fff;
      text-shadow:
        0 2px 4px rgba(0, 0, 0, 0.98),
        0 0 10px rgba(0, 0, 0, 0.9);
      padding: 0 16px;
      font-family: "Helvetica Neue", "Segoe UI", Arial, sans-serif;
      pointer-events: none;
      user-select: none;
    }

    #lc-subtitle-drag {
      pointer-events: auto;
      cursor: grab;
      border: 1px solid rgba(255, 255, 255, 0.4);
      background: rgba(8, 10, 16, 0.5);
      color: #fff;
      border-radius: 8px;
      font-size: 11px;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 4px 8px;
      margin-bottom: 6px;
    }

    #lc-subtitle-overlay[data-dragging="true"] #lc-subtitle-drag {
      cursor: grabbing;
      background: rgba(8, 10, 16, 0.75);
    }

    html.${HIDE_NATIVE_CLASS} video::cue {
      color: transparent !important;
      text-shadow: none !important;
      background: transparent !important;
    }

    html.${HIDE_NATIVE_CLASS} .vjs-text-track-display,
    html.${HIDE_NATIVE_CLASS} .vjs-text-track-cue,
    html.${HIDE_NATIVE_CLASS} .shaka-text-container,
    html.${HIDE_NATIVE_CLASS} .jw-text-track-container {
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.documentElement.appendChild(style);

  window.addEventListener("scroll", updateOverlayPosition, { passive: true });
  window.addEventListener("resize", updateOverlayPosition, { passive: true });
  document.addEventListener("fullscreenchange", updateOverlayPosition);
}

function findBestVideo() {
  const videos = collectVideosFromDocument();
  let best = null;
  let bestScore = 0;

  for (const video of videos) {
    const rect = video.getBoundingClientRect();
    if (!isRectVisible(rect)) {
      continue;
    }

    const visibleRect = getVisibleRect(rect);
    const score = visibleRect.width * visibleRect.height;
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }

  return best;
}

function collectVideosFromDocument() {
  const videos = new Set();

  function crawl(root) {
    if (!root) {
      return;
    }

    for (const video of root.querySelectorAll("video")) {
      videos.add(video);
    }

    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) {
        crawl(element.shadowRoot);
      }
    }
  }

  crawl(document);
  return Array.from(videos);
}

function isRectVisible(rect) {
  return (
    rect.width >= 140 &&
    rect.height >= 90 &&
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= window.innerHeight &&
    rect.left <= window.innerWidth
  );
}

function getVisibleRect(rect) {
  const left = clamp(rect.left, 0, window.innerWidth);
  const right = clamp(rect.right, 0, window.innerWidth);
  const top = clamp(rect.top, 0, window.innerHeight);
  const bottom = clamp(rect.bottom, 0, window.innerHeight);

  return {
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function rectIntersects(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyEnabledClass() {
  document.documentElement.classList.toggle(ENABLED_CLASS, Boolean(state.settings.enabled));
}

function applyNativeCaptionsVisibility() {
  const hasOverlayText = Boolean(state.overlayTextEl?.textContent?.trim());
  const shouldHide = Boolean(state.settings.enabled && state.settings.hideNative && hasOverlayText);

  document.documentElement.classList.toggle(HIDE_NATIVE_CLASS, shouldHide);

  if (!shouldHide) {
    restoreNativeCaptions();
    return;
  }

  // Keep applying hiding while captions change.
  hideNativeCaptionsNearVideo();
}

function hideNativeCaptionsNearVideo() {
  if (state.lastSourceText) {
    hideNativeCaptionsNearVideoByText(state.lastSourceText);
  }
}

function restoreNativeCaptions() {
  for (const node of Array.from(state.hiddenCaptionNodes.keys())) {
    restoreCaptionNode(node);
  }
}

function restoreCaptionNode(node) {
  const original = state.hiddenCaptionNodes.get(node);
  if (!original || !(node instanceof HTMLElement)) {
    state.hiddenCaptionNodes.delete(node);
    return;
  }

  restoreStyleProp(node, "visibility", original.visibility);
  restoreStyleProp(node, "opacity", original.opacity);
  restoreStyleProp(node, "display", original.display);
  restoreStyleProp(node, "pointer-events", original.pointerEvents);
  state.hiddenCaptionNodes.delete(node);
}

function restoreStyleProp(node, prop, value) {
  if (value == null || value === "") {
    node.style.removeProperty(prop);
    return;
  }
  node.style.setProperty(prop, String(value));
}

function hideNativeCaptionsNearVideoByText(sourceText) {
  if (!state.settings.enabled || !state.settings.hideNative) {
    return;
  }

  const videoRect = getVideoRect();
  if (!videoRect) {
    return;
  }

  const lines = String(sourceText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (!lines.length) {
    return;
  }

  const selector = CAPTION_SELECTORS.join(",");
  const nodes = queryAllDeep(selector);

  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (node.id && node.id.startsWith("lc-subtitle-")) {
      continue;
    }

    const rect = node.getBoundingClientRect();
    if (!isRectVisible(rect) || !rectIntersects(rect, videoRect)) {
      continue;
    }

    const centerY = rect.top + rect.height / 2;
    if (centerY < videoRect.top + videoRect.height * 0.45) {
      continue;
    }

    const text = normalizeCueText(node.innerText || node.textContent || "");
    if (!text || text.length > 420) {
      continue;
    }

    if (!lines.some((line) => text.includes(line))) {
      continue;
    }

    if (!isSafeCaptionNode(node, videoRect)) {
      continue;
    }

    if (!state.hiddenCaptionNodes.has(node)) {
      state.hiddenCaptionNodes.set(node, {
        visibility: node.style.visibility,
        opacity: node.style.opacity,
        display: node.style.display,
        pointerEvents: node.style.pointerEvents
      });
    }

    node.style.setProperty("visibility", "hidden", "important");
    node.style.setProperty("opacity", "0", "important");
    node.style.setProperty("pointer-events", "none", "important");
  }
}

function isSafeCaptionNode(node, videoRect) {
  if (!node || !(node instanceof HTMLElement)) {
    return false;
  }
  if (node === document.documentElement || node === document.body) {
    return false;
  }

  const rect = node.getBoundingClientRect();
  if (!rect || rect.width < 20 || rect.height < 8) {
    return false;
  }

  const maxWidth = Math.max(280, videoRect.width * 1.05);
  const maxHeight = Math.max(120, videoRect.height * 0.35);
  if (rect.width > maxWidth || rect.height > maxHeight) {
    return false;
  }

  if (node.childElementCount > 12) {
    return false;
  }

  return true;
}

function emergencyRestorePageVisibility() {
  const critical = [document.documentElement, document.body];
  for (const el of critical) {
    if (!(el instanceof HTMLElement)) {
      continue;
    }
    const hiddenByInline = el.style.display === "none" || el.style.visibility === "hidden" || el.style.opacity === "0";
    if (!hiddenByInline) {
      continue;
    }
    el.style.removeProperty("display");
    el.style.removeProperty("visibility");
    el.style.removeProperty("opacity");
    el.style.removeProperty("pointer-events");
  }
}

function queryAllDeep(selector) {
  const results = [];
  const visited = new Set();

  function crawl(root) {
    if (!root || visited.has(root)) {
      return;
    }
    visited.add(root);

    try {
      results.push(...root.querySelectorAll(selector));
    } catch (_error) {
      // ignore
    }

    try {
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) {
          crawl(element.shadowRoot);
        }
      }
    } catch (_error) {
      // ignore
    }
  }

  crawl(document);
  return results;
}
