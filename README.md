# Vimeo Subtitle Translator (Chrome Extension)

Chrome extension (Manifest V3) that translates subtitles from Vimeo players.

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

## Known limitations

- Depends on subtitle track availability in the player
- In native browser fullscreen, positioning may vary by player
- Uses unofficial translation endpoints; translation may stop if rate-limited
