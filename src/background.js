importScripts(
  "shared/namespace.js",
  "shared/normalize.js",
  "shared/book-metadata.js",
  "shared/catalog-cache.js",
  "connectors/ocpl-polaris-connector.js"
);

async function getSettings() {
  const defaults = {
    libraryName: "Onondaga County Public Library System",
    catalogBaseUrl: "https://catalog.onlib.org/polaris/"
  };

  return chrome.storage.sync.get(defaults);
}

async function hasCatalogPermission(catalogBaseUrl) {
  if (!chrome.permissions || typeof chrome.permissions.contains !== "function") {
    return true;
  }

  try {
    const originPattern = new URL(catalogBaseUrl).origin + "/*";
    return chrome.permissions.contains({ origins: [originPattern] });
  } catch {
    return false;
  }
}

function buildResultCacheKey(settings, book, includeDebug) {
  return [
    settings.libraryName,
    settings.catalogBaseUrl,
    LibraryBrowser.bookMetadata.bestLookupKey(book),
    `v:${LibraryBrowser.catalogCache.RESULT_CACHE_VERSION || 1}`,
    includeDebug ? "d:1" : "d:0"
  ].join("|");
}

function attachCacheMeta(result, meta) {
  return {
    ...result,
    cache: {
      resultHit: Boolean(meta.resultHit),
      urlHits: meta.urlHits || []
    }
  };
}

async function performLookup(message) {
  const settings = await getSettings();
  const includeDebug = Boolean(message.includeDebug);
  const book = message.book;
  const pageUrl = message.pageUrl || book.sourceUrl || "";
  const mode = message.mode || "detail";
  const cache = LibraryBrowser.catalogCache;

  const permitted = await hasCatalogPermission(settings.catalogBaseUrl);
  if (!permitted) {
    const result = {
      status: "needs_setup",
      summary: "Catalog permission needed",
      detail:
        "Permission to query your library catalog is not granted. Open extension settings, save your catalog URL, and allow access. You can also enable debug and use Export support report.",
      actionUrl: "",
      libraryName: settings.libraryName || ""
    };
    await cache.recordDiagnostic({
      pageUrl,
      mode,
      bookKey: LibraryBrowser.bookMetadata.bestLookupKey(book),
      status: result.status,
      resultCacheHit: false,
      error: result.detail
    });
    return attachCacheMeta(result, { resultHit: false, urlHits: [] });
  }

  const cacheKey = buildResultCacheKey(settings, book, includeDebug);
  const cached = await cache.getResult(cacheKey);
  if (cached.hit) {
    const result = attachCacheMeta(cached.result, { resultHit: true, urlHits: [] });
    await cache.recordDiagnostic({
      pageUrl,
      mode,
      bookKey: LibraryBrowser.bookMetadata.bestLookupKey(book),
      status: result.status,
      resultCacheHit: true
    });
    return result;
  }

  const inflight = cache.getResultInflight(cacheKey);
  if (inflight) {
    const result = await inflight;
    return attachCacheMeta(result, { resultHit: true, urlHits: [] });
  }

  const lookupPromise = (async () => {
    const result = await LibraryBrowser.ocplPolarisConnector.lookup(book, settings, {
      includeDebug
    });
    await cache.setResult(cacheKey, result);
    return result;
  })();

  cache.setResultInflight(cacheKey, lookupPromise);

  try {
    const result = await lookupPromise;
    const urlHits = Array.isArray(result.debug && result.debug.catalog && result.debug.catalog.tries)
      ? result.debug.catalog.tries.map((tryEntry) => ({
          kind: tryEntry.kind,
          url: tryEntry.url,
          cacheHit: Boolean(tryEntry.cacheHit)
        }))
      : [];

    await cache.recordDiagnostic({
      pageUrl,
      mode,
      bookKey: LibraryBrowser.bookMetadata.bestLookupKey(book),
      status: result.status,
      resultCacheHit: false,
      urlHits,
      error: result.status === "error" ? result.detail : ""
    });

    return attachCacheMeta(result, { resultHit: false, urlHits });
  } catch (error) {
    const result = {
      status: "error",
      summary: "Lookup failed",
      detail: error instanceof Error ? error.message : "Unknown lookup error",
      actionUrl: "",
      libraryName: ""
    };
    await cache.recordDiagnostic({
      pageUrl,
      mode,
      bookKey: LibraryBrowser.bookMetadata.bestLookupKey(book),
      status: result.status,
      resultCacheHit: false,
      error: result.detail
    });
    return attachCacheMeta(result, { resultHit: false, urlHits: [] });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "libraryLookup") {
    void performLookup(message).then(sendResponse);
    return true;
  }

  if (message?.type === "getSupportReport") {
    void (async () => {
      const settings = await getSettings();
      const { showMetadataDebug = false } = await chrome.storage.sync.get({ showMetadataDebug: false });
      const manifest = chrome.runtime.getManifest();
      const diagnostics = await LibraryBrowser.catalogCache.getDiagnostics();
      sendResponse({
        version: manifest.version,
        generatedAt: new Date().toISOString(),
        settings: {
          libraryName: settings.libraryName,
          catalogBaseUrl: settings.catalogBaseUrl,
          showMetadataDebug: Boolean(showMetadataDebug)
        },
        diagnostics
      });
    })();
    return true;
  }

  return false;
});
