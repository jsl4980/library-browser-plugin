# Privacy Policy

*Library Browser Plugin — last updated: April 12, 2026*

This extension helps you see whether books on Goodreads or Amazon may appear in a public library catalog you configure. It is designed to collect as little data as possible.

## What stays on your device

- Extension settings (such as library name and catalog base URL) are stored with Chrome’s `chrome.storage.sync` and stay under your Google account’s sync rules, like other extension settings.
- Short-lived in-memory caches may be used to avoid repeating the same catalog lookup during a browsing session.

## What leaves your device

- When you visit a supported book page, the extension reads page content that is already visible to you in the tab (for example title, author, ISBN) to perform a lookup.
- If you grant optional access to your library catalog host, the extension sends **search-style requests** to that catalog (for example keyword or ISBN search URLs) to retrieve public catalog HTML. Those requests go directly to the catalog site you configured, not to servers operated by the extension author.
- The extension does not run analytics, ads, or third-party trackers as part of its code.

## Permissions

- **storage** — saves your options.
- **Optional host access** — the catalog origin is listed as optional; the extension only receives it if you approve the prompt from the options page (default configuration targets the Onondaga County Public Library Polaris catalog).

## Children

This extension is not directed at children under 13, and it does not knowingly collect personal information from children.

## Changes

We may update this policy when the extension’s behavior changes. The “last updated” date above will change when it does.

## Contact

For privacy questions, contact the developer using the support email or contact URL provided on the Chrome Web Store listing.
