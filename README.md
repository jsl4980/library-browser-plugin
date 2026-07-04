# Library Browser Plugin

Library Browser Plugin is a Chrome extension that checks whether books you find on Goodreads or Amazon appear in the Onondaga County Public Library System catalog.

## Current status (v0.3.0)

- **Goodreads book detail pages** — inline result card with library availability
- **Goodreads list and grid pages** (shelves, Listopia, search, author pages, related-book carousels, and similar) — small status badges on covers (bottom-right)
  - Green: available now
  - Yellow: in catalog (hold or found)
  - Red: not found
  - Gray: lookup error or catalog setup needed
  - Click a badge for the info card popup (catalog links work; close with outside click, Escape, or the badge again)
- **Amazon book detail pages** — inline result card (same as before)
- Extracts title, author, and ISBN when the page exposes them (list/grid rows use title/author only)
- OCPL Polaris catalog lookup via ISBN and/or keyword search
- Local caches (memory + `chrome.storage.local`) avoid repeating identical catalog requests; ISBN and title/author results are never treated as interchangeable
- Options page: library name, catalog base URL, debug metadata toggle, **Export support report**

The OCPL connector identifies likely matches and infers availability from the Polaris results page, including per-format hints when present. Exact copy-level availability may still need deeper Polaris-specific parsing.

## Load the extension

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click `Load unpacked`
4. Select this folder: `C:\Users\james\Projects\library-browser-plugin`

After code changes, use **Reload** on the extension card, then refresh any open Goodreads or Amazon tabs.

## Configure it

Open the extension options page to review or change:

- Library name
- Polaris catalog base URL
- Show lookup metadata (for testing; also enables richer diagnostics on cards and list popups)
- Export support report (downloads recent on-device lookup diagnostics; no remote telemetry)

Default catalog:

- `https://catalog.onlib.org/polaris/`

Save settings once so Chrome can grant optional access to your catalog host.

## Reporting a problem

1. Enable **Show lookup metadata** in options (optional but helpful).
2. Reproduce the issue on the book or list page.
3. Use **Copy diagnostics** on the card/popup, or **Export support report** from options.
4. Attach that JSON when filing a bug.

## Chrome Web Store

Build a store ZIP (tests run first), then follow listing, privacy, API, and GitHub Actions steps in [docs/CHROME_WEB_STORE.md](docs/CHROME_WEB_STORE.md). For the store’s privacy disclosure, use a public HTTPS URL to [docs/privacy-policy.md](docs/privacy-policy.md) (for example the GitHub blob URL described in that doc).

When updating the listing, keep the description and screenshots consistent with list/grid badges as well as detail-page cards.

## Tests

- Run fixture-backed integration tests with `npm test`
- Run opt-in live OCPL smoke tests with `npm run test:live`

The integration test suite is traceable back to user stories and includes:

- connector contract tests for OCPL Polaris (including catalog URL cache behavior)
- page-to-connector rendering tests for Goodreads (detail, list, grid) and Amazon
- a registry of test cases and linked stories under `tests/traceability/`
