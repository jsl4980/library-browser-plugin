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

  function inferAvailability(rawText) {
    if (/available now\s*\(\s*[1-9]/i.test(rawText) || /\bon shelf\b/i.test(rawText)) {
      return {
        status: "available_now",
        summary: "Available now at OCPL",
        detail: "The catalog page indicates at least one available copy."
      };
    }

    if (/\bplace hold\b/i.test(rawText) || /\brequest it\b/i.test(rawText) || /\bholds?\b/i.test(rawText)) {
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

    for (const url of urls) {
      try {
        const page = await fetchCatalogPage(url);
        const normalizedPageText = normalizeText(page.text);

        if (pageHasMatch(book, normalizedPageText)) {
          const availability = inferAvailability(page.text);
          return {
            ...availability,
            actionUrl: page.url,
            libraryName: settings.libraryName
          };
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

    return {
      status: "not_found",
      summary: "Not found at OCPL",
      detail: "OCPL did not return a strong title, author, or ISBN match from the catalog search.",
      actionUrl: urls[0],
      libraryName: settings.libraryName
    };
  }

  app.ocplPolarisConnector = {
    lookup
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
