# Contributing

Thanks for your interest in contributing.

## Setup

1. Fork the repository.
2. Clone your fork locally.
3. Load the extension from `chrome://extensions` using `Load unpacked`.

## Development guidelines

- Keep changes small and focused.
- Preserve extension stability over feature complexity.
- Avoid risky global DOM operations.
- Follow existing naming and style conventions.

## Validation checklist

Before opening a pull request, run:

- `node --check content.js`
- `node --check background.js`
- `node --check popup.js`
- `python3 -m json.tool manifest.json >/dev/null`

Manual checks:

1. Test on `vimeo.com`.
2. Test on at least one site with embedded Vimeo player.
3. Verify mode switches and font/background controls.
4. Verify `Hide player subtitles` ON/OFF behavior.
5. Confirm no blocking console errors.

## Pull request notes

- Describe the user-facing impact.
- Mention testing performed.
- Include screenshots for popup/overlay UI changes when relevant.
