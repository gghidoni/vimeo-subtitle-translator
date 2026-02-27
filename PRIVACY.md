# Privacy Policy

Last updated: 2026-02-27

## Overview

Vimeo Subtitle Translator is a client-side Chrome extension.
It does not require user accounts and does not include analytics or ad tracking.

## Data this extension processes

- Subtitle text currently shown by Vimeo players.
- The selected translation target language.
- User preferences (enabled state, display mode, font size, position, and visual settings).

## Where data is stored

- Preferences are stored in `chrome.storage.sync` under the user's Chrome profile.
- The extension does not maintain a remote user database.

## Network requests

To translate subtitles, the extension sends subtitle text and target language to external translation endpoints:

- `https://translate.googleapis.com/*`
- `https://clients5.google.com/*`

These services are operated by Google and are subject to their own terms and privacy policies.

## Data sharing

- The extension does not sell user data.
- The extension does not intentionally share data with third parties beyond translation requests required for functionality.

## Security notes

- Translation requests are made over HTTPS.
- No API keys are required for the current translation flow.

## Contact

For privacy-related questions, open an issue in this repository.
