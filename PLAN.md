# Library Browser Plugin Plan

## Goal

When browsing a book on Goodreads or Amazon, show whether the user's library appears to carry it and provide a direct path into the library catalog.

## Current scope

- Chrome-first browser extension
- Goodreads and Amazon book detail pages
- Inline page card for library results
- OCPL Polaris connector

## Delivered in the first slice

- Manifest V3 extension scaffold
- Page adapters for Goodreads and Amazon
- Shared metadata normalization
- Background lookup flow with short-lived caching
- Options page for library setup
- OCPL Polaris connector using direct ISBN and keyword lookup URLs

## Next implementation priorities

1. Deepen OCPL Polaris parsing further (copy-level detail, drift hardening); per-format availability (US7) shipped in connector + card.
2. Harden Goodreads and Amazon page parsing against layout changes.
3. Add regression fixtures for sample book pages and known OCPL catalog results.
4. Generalize the connector interface after the OCPL flow is stable.

## Decisions

- 2026-04-05: V1 is Chrome-first.
- 2026-04-05: V1 uses inline page UI.
- 2026-04-05: V1 starts with direct library lookup, not Libby account integration.
- 2026-04-05: V1 should optimize for one real library before broad multi-library support.
- 2026-04-11: The first real library integration targets the Onondaga County Public Library System Polaris catalog at `https://catalog.onlib.org/polaris/Search/default.aspx`.
- 2026-04-12: US7 — table-row parsing maps Polaris-style material labels to print / ebook / audiobook buckets with per-format availability hints in the inline card.
- 2026-04-12: OCPL loads hit lists via AJAX; connector also reads PowerPAC **Type of Material** narrow-search facets and tries later lookup URLs when the ISBN response has no format data. Availability text ignores `<script>` so UI strings like “Place Hold” do not false-trigger holds.
- 2026-04-12: Connector follows **`components/ajaxResults.aspx?page=1`** when the search shell has `ajaxLoadResultsPage` but no `c-title-detail-formats__img` yet, then parses **`img.c-title-detail-formats__img`** (`title`/`alt`) for print + ebook (e.g. **Book**, **Ebook**, **OverDrive Inc.**).

## Open items

- Sample books to use as acceptance fixtures

## OCPL ISBN / format icons — feasibility notes (2026-04-12)

Exploration only: verified live HTML behavior for several current bestseller ISBNs against **Onondaga County Public Library** PowerPAC (`catalog.onlib.org`). Book list for sampling drew from **NYT hardcover fiction (early April 2026)** plus **`The Martian`** / **`Project Hail Mary`** (existing live-test titles).

### How HTML is actually loaded

- A plain `GET` of `view.aspx?isbn=…` redirects to `search/searchresults.aspx?…by=ISBN…`.
- The returned page’s `#searchResults` div initially contains only a **loading spinner**; hit markup is loaded by **`ajaxLoadResultsPage`** in `results.js`, which pulls **`search/components/ajaxResults.aspx?page=1`** (same session cookies as the search results page).
- **Feasibility for server-style fetch:** you must either (1) establish a session via `searchresults.aspx` then `GET ajaxResults.aspx?page=1`, or (2) run a real browser. The connector’s single `fetch()` of `view.aspx?isbn=…` receives the **shell**, not the fragment with format icons (unless redirects/caching differ in-extension).

### `c-title-detail-formats__list` / `c-title-detail-formats__img`

For **each ISBN below**, the first hit in `ajaxResults.aspx?page=1` included:

- `div.c-title-detail-formats__list`
- One or more `img.c-title-detail-formats__img` with **`alt` and `title` identical** in every case observed.
- Wrapper `<a href="javascript:showModalBasic('…/ajaxMARC.aspx?pos=1')">` — icon opens MARC modal, **not** availability.

| ISBN-13 | Title (approx.) | Icons (`alt` / `title`) | `patFuncBookGroup` in same fragment |
|---------|-----------------|-------------------------|-------------------------------------|
| 9780525620785 | Mexican Gothic | `Book` | Not present |
| 9780316579834 | Judge Stone | `Book` | Not present |
| 9780593798430 | The Correspondent | `Book` | Not present |
| 9781250337818 | My Husband's Wife | `Book` | Not present |
| 9780593851098 | The Crossroads | `Book` | Not present |
| 9780553418026 | The Martian | `Book` | Not present |
| 9780593135204 | Project Hail Mary | `Book` | Not present |

### Mapping to [`classifyMaterialType`](src/connectors/ocpl-polaris-connector.js)

- The string **`Book`** matches the existing **`/\bbook\b/`** branch → **`physical_book`**. No parser gaps for this sample.

### Project Hail Mary + ISBN `0593135211` (multi-hit search)

Live `ajaxResults.aspx` for [this search](https://catalog.onlib.org/polaris/search/searchresults.aspx?ctx=1.1033.0.0.6&type=Keyword&term=0593135211&by=ISBN&sort=RELEVANCE&limit=TOM=*&query=&page=0&searchid=11) shows **three** brief results: two print (`alt`/`title` **Book**) and one OverDrive row with **`overdrive.jpg`** (`OverDrive Inc.`) plus **`formatid36.gif`** (`Ebook`). **`classifyMaterialType`** already maps **Ebook** and **OverDrive** substrings to the **ebook** bucket. Regression fixture: [`tests/fixtures/ocpl/ocpl-phm-isbn-combined.html`](tests/fixtures/ocpl/ocpl-phm-isbn-combined.html) (shell + captured fragment).

### Gaps / follow-ups

- **Audiobook icons:** Not yet seen on a live brief result with `c-title-detail-formats__img`; extend fixtures when a sample exists.
- **Availability:** These icons indicate **format presence** only; per-format availability still requires **table rows**, **facets**, or another detail view if we need “available now” vs hold.
- **Next step for implementation:** add a fixture from a **saved `ajaxResults.aspx` (or full DOM) fragment** containing `c-title-detail-formats__list`, then implement regex extraction on `img` `alt`/`title` and merge with the existing table/facet path.
