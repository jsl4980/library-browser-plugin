# Privacy Policy

*Library Browser Plugin — last updated: July 3, 2026*

This extension helps you see whether books on Goodreads or Amazon may appear in a public library catalog you configure. It is designed to collect as little data as possible.

## What stays on your device

- Extension settings (such as library name and catalog base URL) are stored with Chrome’s `chrome.storage.sync` and stay under your Google account’s sync rules, like other extension settings.
- Local caches on your device (`chrome.storage.local` and short-lived memory) may store recent catalog page HTML and lookup results so the extension does not repeat the same library search unnecessarily. Cached availability is not sent to the extension author.
- A small on-device diagnostic buffer of recent lookups (status, URLs, error messages — not full catalog HTML) may be kept so you can copy or export a support report if something goes wrong. Export and copy are user-initiated only.

## What leaves your device

- When you visit Goodreads (including list and grid pages that show books) or a supported Amazon book page, the extension reads page content that is already visible to you in the tab (for example title, author, and ISBN when present) to perform a lookup.
- If you grant optional access to your library catalog host, the extension sends **search-style requests** to that catalog (for example keyword or ISBN search URLs) to retrieve public catalog HTML. Those requests go directly to the catalog site you configured, not to servers operated by the extension author.
- The extension does not run analytics, ads, or third-party trackers as part of its code. Diagnostic data is not uploaded automatically.

## Permissions

- **storage** — saves your options, local caches, and the optional diagnostic buffer.
- **Optional host access** — the catalog origin is listed as optional; the extension only receives it if you approve the prompt from the options page (default configuration targets the Onondaga County Public Library Polaris catalog).

## Children

This extension is not directed at children under 13, and it does not knowingly collect personal information from children.

## Changes

We may update this policy when the extension’s behavior changes. The “last updated” date above will change when it does.

## Contact

For privacy questions, contact the developer using the support email or contact URL provided on the Chrome Web Store listing.
