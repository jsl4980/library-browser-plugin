# Library Browser Plugin

Library Browser Plugin is a Chrome extension scaffold that checks whether books you find on Goodreads or Amazon appear in the Onondaga County Public Library System catalog.

## Current status

This is the first vertical slice:

- Detects Goodreads and Amazon book detail pages
- Extracts title, author, and ISBN when possible
- Shows an inline result card on the page
- Uses the Onondaga County Public Library System Polaris catalog as the default lookup target
- Performs a simple OCPL catalog lookup using direct Polaris ISBN and keyword searches

The current OCPL connector can identify likely matches and attempts a basic availability inference from the Polaris results page. Exact copy-level availability may still need deeper Polaris-specific parsing.

## Load the extension

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Click `Load unpacked`
4. Select this folder: `C:\Users\james\Projects\library-browser-plugin`

## Configure it

Open the extension options page to review or change:

- Library name
- Polaris catalog base URL

Default:

- `https://catalog.onlib.org/polaris/`

## Next step

The next improvement is to deepen the Polaris parsing so the extension can distinguish branch-level copy availability, holdability, and format with higher confidence.

## Chrome Web Store

Build a store ZIP (tests run first), then follow listing, privacy, API, and GitHub Actions steps in [docs/CHROME_WEB_STORE.md](docs/CHROME_WEB_STORE.md). Host [docs/privacy-policy.html](docs/privacy-policy.html) at a public HTTPS URL for the store’s privacy disclosure.

## Tests

- Run fixture-backed integration tests with `npm test`
- Run opt-in live OCPL smoke tests with `npm run test:live`

The integration test suite is traceable back to user stories and includes:

- connector contract tests for OCPL Polaris
- page-to-connector rendering tests for Goodreads and Amazon
- a registry of test cases and linked stories under `tests/traceability/`
