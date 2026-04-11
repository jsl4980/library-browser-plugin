(function registerOcplPolarisConnector(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const { encodeTemplateValue, normalizeText } = app.normalize;

  const DEFAULT_BASE_URL = "https://catalog.onlib.org/polaris/";

  function getBaseUrl(settings) {
    return settings.catalogBaseUrl || DEFAULT_BASE_URL;
  }

  function joinUrl(baseUrl, pathAndQuery) {
    return new URL(pathAndQuery, baseUrl).toString();
  }

  function buildLookupUrls(book, settings) {
    const baseUrl = getBaseUrl(settings);
    const urls = [];

    if (book.isbn13 || book.isbn10) {
      urls.push(joinUrl(baseUrl, `view.aspx?isbn=${encodeTemplateValue(book.isbn13 || book.isbn10)}`));
    }

    if (book.title) {
      urls.push(joinUrl(baseUrl, `view.aspx?keyword=${encodeTemplateValue(book.title)}`));
    }

    if (book.title && book.author) {
      urls.push(
        joinUrl(
          baseUrl,
          `view.aspx?keyword=${encodeTemplateValue(`${book.title} ${book.author}`)}`
        )
      );
    }

    return urls;
  }

  async function fetchCatalogPage(url) {
    const response = await fetch(url, {
      method: "GET",
      // Same-origin catalog cookies avoid Polaris redirect loops (see redirect cap).
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Catalog request returned ${response.status}.`);
    }

    return {
      url,
      text: await response.text()
    };
  }

  function pageHasMatch(book, normalizedPageText) {
    const isbn13Match = book.isbn13 && normalizedPageText.includes(normalizeText(book.isbn13));
    const isbn10Match = book.isbn10 && normalizedPageText.includes(normalizeText(book.isbn10));
    const titleMatch = book.normalizedTitle && normalizedPageText.includes(book.normalizedTitle);
    const authorMatch = !book.normalizedAuthor || normalizedPageText.includes(book.normalizedAuthor);

    return Boolean(isbn13Match || isbn10Match || (titleMatch && authorMatch));
  }

  function htmlToVisibleText(html) {
    if (!html || typeof html !== "string") {
      return "";
    }
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function inferAvailability(rawTextOrHtml) {
    const text = /<[a-z][\s\S]*>/i.test(rawTextOrHtml) ? htmlToVisibleText(rawTextOrHtml) : rawTextOrHtml;

    if (/available now\s*\(\s*[1-9]/i.test(text) || /\bon shelf\b/i.test(text)) {
      return {
        status: "available_now",
        summary: "Available now at OCPL",
        detail: "The catalog page indicates at least one available copy."
      };
    }

    if (/\bplace hold\b/i.test(text) || /\brequest it\b/i.test(text) || /\bholds?\b/i.test(text)) {
      return {
        status: "hold_available",
        summary: "Found at OCPL",
        detail: "The book appears in the catalog and may require a hold or sign-in for copy details."
      };
    }

    return {
      status: "found",
      summary: "Found at OCPL",
      detail: "The book appears in the OCPL catalog."
    };
  }

  const AVAILABILITY_RANK = {
    available_now: 4,
    hold_available: 3,
    found: 2,
    unknown: 1
  };

  const BUCKET_ORDER = ["physical_book", "ebook", "audiobook"];

  function stripMarkupNoise(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
  }

  function classifyNarrowFacetLabel(label) {
    const t = label.toLowerCase().trim();
    if (!t || t === "available now") {
      return null;
    }
    if (
      /^audio books$/.test(t) ||
      /^nonmusical sound recording$/.test(t) ||
      /^sound recording$/.test(t) ||
      /\bplayaway\b/.test(t) ||
      /\btalking book\b/.test(t) ||
      /\bbook on cd\b/.test(t)
    ) {
      return "audiobook";
    }
    if (
      /^electronic resources$/.test(t) ||
      /\be-?book\b/.test(t) ||
      /\bebook\b/.test(t) ||
      /\boverdrive\b/.test(t) ||
      /\bdigital\b/.test(t) ||
      /\bdownloadable\b/.test(t)
    ) {
      return "ebook";
    }
    if (t === "book" || /\bhardcover\b/.test(t) || /\bpaperback\b/.test(t) || /\blarge print\b/.test(t)) {
      return "physical_book";
    }
    if (/\bbook\b/.test(t) && !/audio/.test(t)) {
      return "physical_book";
    }
    return null;
  }

  function extractTypeOfMaterialFacetSlice(html) {
    const lower = html.toLowerCase();
    const start = lower.indexOf("type of material");
    if (start === -1) {
      return "";
    }
    const fromStart = html.slice(start);
    const subjIdx = fromStart.search(/<h6[^>]*>\s*subjects\s*</i);
    const end = subjIdx === -1 ? 20000 : subjIdx;
    return fromStart.slice(0, end);
  }

  function extractAvailableNowFacetCount(html) {
    const scan = (block) => {
      const low = block.toLowerCase();
      const typeIdx = low.indexOf("type of material");
      const slice = typeIdx === -1 ? block : block.slice(0, typeIdx);
      const m = slice.match(/Available Now[\s\S]{0,2500}?c-accordion__span-count[^>]*>[\s\S]*?\((\d+)\)/i);
      return m ? parseInt(m[1], 10) : 0;
    };
    const low = html.toLowerCase();
    const narrowIdx = low.indexOf("narrow your search");
    if (narrowIdx !== -1) {
      const n = scan(html.slice(narrowIdx, narrowIdx + 14000));
      if (n > 0) {
        return n;
      }
    }
    return scan(html);
  }

  function extractMaterialFacetFormats(html) {
    const slice = extractTypeOfMaterialFacetSlice(html);
    if (!slice) {
      return [];
    }
    const itemPattern =
      /<label[^>]*c-accordion__label-narrowsearch[^>]*>([\s\S]*?)<\/label>\s*<span class="c-accordion__span-count">[\s\S]*?\((\d+)\)[\s\S]*?<\/span>/gi;
    const raw = [];
    let match;

    while ((match = itemPattern.exec(slice)) !== null) {
      const labelText = flattenCellHtml(match[1]);
      const count = parseInt(match[2], 10);
      if (!labelText || !Number.isFinite(count) || count < 1) {
        continue;
      }
      const bucket = classifyNarrowFacetLabel(labelText);
      if (!bucket) {
        continue;
      }
      raw.push({ bucket, label: labelText.trim(), count });
    }

    const byBucket = new Map();
    for (const row of raw) {
      const prev = byBucket.get(row.bucket);
      if (!prev || row.count > prev.count) {
        byBucket.set(row.bucket, row);
      }
    }

    return BUCKET_ORDER.filter((b) => byBucket.has(b)).map((b) => {
      const row = byBucket.get(b);
      return {
        bucket: b,
        label: row.label,
        count: row.count,
        availability: "found",
        hint: `About ${row.count} matches`
      };
    });
  }

  function flattenCellHtml(fragment) {
    return fragment.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  function classifyMaterialType(text) {
    const t = text.toLowerCase();
    if (
      /\baudiobook\b/.test(t) ||
      /\baudio book\b/.test(t) ||
      /\bsound recording\b/.test(t) ||
      /\bbook on cd\b/.test(t) ||
      /\bcd audiobook\b/.test(t) ||
      /\bdownloadable audio\b/.test(t) ||
      /\btalking book\b/.test(t) ||
      /\bplayaway\b/.test(t)
    ) {
      return "audiobook";
    }
    if (
      /\be-?book\b/.test(t) ||
      /\bebook\b/.test(t) ||
      /\bdownloadable ebook\b/.test(t) ||
      /\boverdrive\b/.test(t) ||
      /\bepub\b/.test(t) ||
      /\bkindle\b/.test(t) ||
      /\bdigital book\b/.test(t) ||
      /\bebk\b/.test(t) ||
      /\belr\b/.test(t)
    ) {
      return "ebook";
    }
    if (
      /\bbook\b/.test(t) ||
      /\bhardcover\b/.test(t) ||
      /\bpaperback\b/.test(t) ||
      /\blarge print\b/.test(t) ||
      /\btrade paperback\b/.test(t)
    ) {
      return "physical_book";
    }
    return null;
  }

  function inferAvailabilityForFragment(text) {
    if (/available now\s*\(\s*[1-9]/i.test(text) || /\bon shelf\b/i.test(text)) {
      return "available_now";
    }
    if (
      /\bplace hold\b/i.test(text) ||
      /\brequest it\b/i.test(text) ||
      /\bholds?\b/i.test(text) ||
      /\bchecked out\b/i.test(text)
    ) {
      return "hold_available";
    }
    return "unknown";
  }

  function mergeFormatsByBucket(rows) {
    const best = new Map();
    for (const row of rows) {
      const prev = best.get(row.bucket);
      if (!prev || AVAILABILITY_RANK[row.availability] > AVAILABILITY_RANK[prev.availability]) {
        best.set(row.bucket, row);
      }
    }
    const primary = BUCKET_ORDER.filter((b) => best.has(b)).map((b) => best.get(b));
    const extra = [...best.keys()]
      .filter((b) => !BUCKET_ORDER.includes(b))
      .map((b) => best.get(b));
    return primary.concat(extra);
  }

  function extractFormatRowsFromHtml(html) {
    const clean = stripMarkupNoise(html);
    const trPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    const parsed = [];
    let rowMatch;

    while ((rowMatch = trPattern.exec(clean)) !== null) {
      const inner = rowMatch[1];
      const cells = [];
      const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;

      while ((cellMatch = cellPattern.exec(inner)) !== null) {
        cells.push(flattenCellHtml(cellMatch[1]));
      }

      if (cells.length < 2) {
        continue;
      }

      const formatLabel = cells[0];
      const rest = cells.slice(1).join(" ");

      if (/^format$/i.test(formatLabel)) {
        continue;
      }

      const bucket = classifyMaterialType(`${formatLabel} ${rest}`);
      if (!bucket) {
        continue;
      }

      const availability = inferAvailabilityForFragment(`${rest} ${formatLabel}`);
      parsed.push({ bucket, label: formatLabel, availability });
    }

    return mergeFormatsByBucket(parsed);
  }

  function hintForAvailability(availability) {
    if (availability === "available_now") {
      return "Available now";
    }
    if (availability === "hold_available") {
      return "Hold or request";
    }
    if (availability === "found") {
      return "In catalog";
    }
    return "Availability unclear";
  }

  function summarizeWithFormats(mergedFormats, coarse) {
    const detail = mergedFormats
      .map((row) => {
        const displayName =
          row.bucket === "physical_book"
            ? "Print book"
            : row.bucket === "ebook"
              ? "E-book"
              : row.bucket === "audiobook"
                ? "Audiobook"
                : row.label;
        return `${displayName}: ${hintForAvailability(row.availability)}`;
      })
      .join(" · ");

    if (mergedFormats.some((row) => row.availability === "available_now")) {
      return {
        status: "available_now",
        summary: "Available now at OCPL",
        detail
      };
    }

    if (mergedFormats.some((row) => row.availability === "hold_available")) {
      return {
        status: "hold_available",
        summary: "Found at OCPL",
        detail
      };
    }

    if (mergedFormats.every((row) => row.availability === "unknown")) {
      return {
        status: coarse.status,
        summary: coarse.summary,
        detail: detail || coarse.detail
      };
    }

    return {
      status: "found",
      summary: "Found at OCPL",
      detail: detail || coarse.detail
    };
  }

  function summarizeFacetFormats(coarse, availableNowCount) {
    const detail =
      availableNowCount > 0
        ? `${availableNowCount} listings in this search show as available now. Open the catalog for where to pick up or place a hold.`
        : "These numbers are from the catalog search. Open the catalog for live copies and holds.";

    if (availableNowCount > 0) {
      return {
        status: "available_now",
        summary: "Available now at OCPL",
        detail
      };
    }

    if (coarse.status === "hold_available") {
      return {
        status: "hold_available",
        summary: "Found at OCPL",
        detail
      };
    }

    return {
      status: "found",
      summary: "Found at OCPL",
      detail
    };
  }

  const CATALOG_LIVE_DETAIL =
    " Open the catalog for per-format copies and holds (live rows load in the browser).";

  async function lookup(book, settings) {
    const urls = buildLookupUrls(book, settings);

    if (!urls.length) {
      return {
        status: "error",
        summary: "Missing book details",
        detail: "This page did not expose enough book information to search OCPL.",
        actionUrl: "",
        libraryName: settings.libraryName
      };
    }

    let chosen = null;

    for (const url of urls) {
      try {
        const page = await fetchCatalogPage(url);
        const normalizedPageText = normalizeText(page.text);

        if (!pageHasMatch(book, normalizedPageText)) {
          continue;
        }

        const tableFormats = extractFormatRowsFromHtml(page.text);
        const facetFormats = tableFormats.length ? [] : extractMaterialFacetFormats(page.text);
        const mergedFormats = tableFormats.length ? tableFormats : facetFormats;
        const facetMode = Boolean(!tableFormats.length && facetFormats.length > 0);

        if (!chosen) {
          chosen = { page, mergedFormats, facetMode };
        }

        if (mergedFormats.length > 0) {
          chosen = { page, mergedFormats, facetMode };
          break;
        }
      } catch (error) {
        return {
          status: "error",
          summary: "Library search failed",
          detail: error instanceof Error ? error.message : "Unexpected catalog lookup error.",
          actionUrl: url,
          libraryName: settings.libraryName
        };
      }
    }

    if (!chosen) {
      return {
        status: "not_found",
        summary: "Not found at OCPL",
        detail: "OCPL did not return a strong title, author, or ISBN match from the catalog search.",
        actionUrl: urls[0],
        libraryName: settings.libraryName
      };
    }

    const { page, mergedFormats, facetMode } = chosen;
    const coarse = inferAvailability(page.text);

    if (mergedFormats.length === 0) {
      return {
        ...coarse,
        detail: coarse.detail + CATALOG_LIVE_DETAIL,
        actionUrl: page.url,
        libraryName: settings.libraryName
      };
    }

    if (facetMode) {
      const availableNowCount = extractAvailableNowFacetCount(page.text);
      const summaryBlock = summarizeFacetFormats(coarse, availableNowCount);
      return {
        ...summaryBlock,
        actionUrl: page.url,
        libraryName: settings.libraryName,
        formats: mergedFormats.map((row) => {
          const entry = {
            bucket: row.bucket,
            label: row.label,
            availability: row.availability,
            hint: row.hint
          };
          if (typeof row.count === "number") {
            entry.count = row.count;
          }
          return entry;
        })
      };
    }

    const summaryBlock = summarizeWithFormats(mergedFormats, coarse);
    return {
      ...summaryBlock,
      actionUrl: page.url,
      libraryName: settings.libraryName,
      formats: mergedFormats.map((row) => ({
        bucket: row.bucket,
        label: row.label,
        availability: row.availability,
        hint: hintForAvailability(row.availability)
      }))
    };
  }

  app.ocplPolarisConnector = {
    lookup
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
