# Vimeo Subtitle Translator (Chrome Extension)

Chrome extension (Manifest V3) that translates subtitles from Vimeo players.

This project is open source and designed for pages that host Vimeo videos directly or through embedded Vimeo iframes.

## Features

- Real-time subtitle translation
- Modes: `Translated + original`, `Translated only`, `Original only`
- Language selector from the extension popup
- Subtitles can be dragged directly by dragging the text
- Popup slider to increase/decrease font size
- Subtitle background toggle with opacity slider
- In-memory local cache to avoid duplicate requests

## Local installation

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the `vimeo-subtitle-translator` folder

## Usage

1. Open any page with a Vimeo video (vimeo.com or an embedded Vimeo player)
2. Make sure original subtitles are available in the player
3. Click the extension icon and choose language/mode
4. Drag the subtitle text directly to reposition it
5. Use `Reset subtitle position` in the popup to restore automatic placement

## Permissions explained

- `storage`: saves extension settings (language, mode, font, position, visual options) in `chrome.storage.sync`.
- `content_scripts` on all `http/https` pages with `all_frames`: needed to detect Vimeo players embedded in third-party sites.
- `host_permissions` for `translate.googleapis.com` and `clients5.google.com`: used to request subtitle translations.

Even though the content script is injected broadly to support embedded players, subtitle processing only becomes useful when a Vimeo player/subtitle track is available.

## Privacy

- No accounts, no analytics, no tracking identifiers.
- Subtitle text and selected target language are sent to configured translation endpoints.
- Settings are stored locally via Chrome sync storage.
- See `PRIVACY.md` for details.

## Known limitations

- Depends on subtitle track availability in the player
- In native browser fullscreen, positioning may vary by player
- Uses unofficial translation endpoints; translation may stop if rate-limited

## Security and support

- Security reporting process: `SECURITY.md`
- Contribution guide: `CONTRIBUTING.md`
- Changelog: `CHANGELOG.md`
