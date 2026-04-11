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

1. Deepen OCPL Polaris parsing to extract exact copy and format availability.
2. Harden Goodreads and Amazon page parsing against layout changes.
3. Add regression fixtures for sample book pages and known OCPL catalog results.
4. Generalize the connector interface after the OCPL flow is stable.

## Decisions

- 2026-04-05: V1 is Chrome-first.
- 2026-04-05: V1 uses inline page UI.
- 2026-04-05: V1 starts with direct library lookup, not Libby account integration.
- 2026-04-05: V1 should optimize for one real library before broad multi-library support.
- 2026-04-11: The first real library integration targets the Onondaga County Public Library System Polaris catalog at `https://catalog.onlib.org/polaris/Search/default.aspx`.

## Open items

- Sample books to use as acceptance fixtures
