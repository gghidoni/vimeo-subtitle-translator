# AGENTS.md - Operational Guide for New Agent Sessions

This document serves as persistent context for anyone resuming this project in a new session.

## 1) Project Goal

Chrome extension (Manifest V3) for Vimeo players that:

- intercepts player subtitles,
- translates them in real time,
- shows a custom draggable overlay,
- allows configuration from the popup (language, mode, font, hide native captions),
- avoids overlap with native player subtitles.

## 2) Current Status (Important)

The current status is considered **good/stable**:

- extension subtitle generation: OK,
- overlay drag: OK,
- mode switching (`both` / `translated` / `original`): OK,
- font size control: OK,
- settings persistence via `chrome.storage.sync`: OK,
- push to GitHub already done (`main`).

Critical note: severe regressions happened in the past (blank page / missing subtitles). Before touching hide native captions logic, read the "Risks and Regression Prevention" section.

## 3) File Structure

- `manifest.json`: MV3 extension configuration, permissions, content script, service worker, popup.
- `background.js`: translation via Google endpoints (multiple fallbacks), runtime message handling.
- `content.js`: main logic (video detection, text tracks, overlay rendering, drag, hide native captions, settings sync).
- `popup.html`: extension settings UI.
- `popup.js`: popup binding to `chrome.storage.sync`.
- `README.md`: local install/usage instructions.

## 4) Current Technical Flow

1. `content.js` detects the main video on the page (including dynamic elements).
2. It tries to bind to `TextTrack` (`subtitles` / `captions`).
3. If needed, it "wakes up" track elements to force cue loading.
4. On `cuechange`, it reads source text and translates via `chrome.runtime.sendMessage` to `background.js`.
5. It renders text in the custom overlay.
6. Based on settings, it hides native subtitles in a controlled way.

## 5) Risks and Regression Prevention (MANDATORY)

### 5.1 Do Not Hide Global Containers

In a previous regression, an aggressive fallback hid DOM ancestors and caused a blank page.

Rules:

- do not hide `html`, `body`, or large wrapper containers,
- do not hide ancestors without strict limits,
- avoid `display:none` on nodes that are not clearly caption-like,
- prefer targeted hiding with filters on rectangle/position/size/text.

### 5.2 `TextTrack.mode` and Cue Loading

On some players, cues do not arrive if the track is not "activated".

Current strategy:

- optional warm-up phase with `showing` to load cues,
- then native rendering management through controlled hide,
- avoid leaving the system in a no-cues + native-hidden state.

### 5.3 Fail-safe

If the overlay has no text, native captions must not stay hidden forever.

## 6) Expected Behavior (Acceptance Criteria)

A change is acceptable only if all of the following are true:

1. a page with a Vimeo player does not become blank when enabling the extension,
2. at least one Vimeo video shows extension subtitles during playback,
3. overlay drag works,
4. popup mode switch is applied in real time,
5. font slider is applied in real time,
6. toggling `Hide player subtitles` produces coherent behavior,
7. when disabling the extension, the player remains usable (no persistent dirty state),
8. no blocking JS errors in the console.

## 7) Operational Checklist for Future Changes

When an agent makes non-trivial changes in `content.js`:

1. keep changes small and isolated,
2. do not introduce destructive fallbacks on the global DOM,
3. run local syntax checks:
   - `node --check content.js`
   - `node --check background.js`
   - `node --check popup.js`
   - `python3 -m json.tool manifest.json >/dev/null`
4. reload the extension in `chrome://extensions`,
5. run a quick manual test on a Vimeo video.

## 8) Recommended Quick Debug

If something does not work:

- check exposed textTracks:
```js
Array.from(document.querySelector("video")?.textTracks || []).map(t => ({kind:t.kind,label:t.label,lang:t.language,mode:t.mode,cues:t.cues?.length}))
```

- check how many videos/tracks are on the page:
```js
[...document.querySelectorAll("video")].map((v,i)=>({
  i,
  w: Math.round(v.getBoundingClientRect().width),
  h: Math.round(v.getBoundingClientRect().height),
  trackEls: v.querySelectorAll("track").length,
  textTracks: v.textTracks?.length ?? null
}))
```

- check runtime errors in the page console and in the extension service worker.

## 9) Priority for Next Interventions (If Requested)

1. Reduce `content.js` complexity into logical modules (track manager / overlay manager / settings manager).
2. Add optional debug mode in the popup (e.g., track/cue state in the overlay).
3. Improve caption detection for non-standard players without introducing visual regressions.
4. Evaluate translation providers with API keys (DeepL/OpenAI) as a stable alternative.

## 10) Recommended Change Rules

- Prefer robustness over "clever" features.
- If a fix is uncertain, introduce a feature flag/toggle instead of changing global behavior.
- Every time hide native captions logic is touched, test with:
  - extension enabled,
  - extension disabled,
  - hideNative ON,
  - hideNative OFF.

## 11) Useful Git Commands

```bash
git status
git diff
git add .
git commit -m "<message>"
git push
```

Remote repository:

- `git@github.com:gghidoni/vimeo-subtitle-translator.git`
