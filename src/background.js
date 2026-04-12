importScripts(
  "shared/namespace.js",
  "shared/normalize.js",
  "shared/book-metadata.js",
  "connectors/ocpl-polaris-connector.js"
);

const CACHE_TTL_MS = 5 * 60 * 1000;
const LOOKUP_CACHE = new Map();

async function getSettings() {
  const defaults = {
    libraryName: "Onondaga County Public Library System",
    catalogBaseUrl: "https://catalog.onlib.org/polaris/"
  };

  return chrome.storage.sync.get(defaults);
}

function getCachedValue(key) {
  const cached = LOOKUP_CACHE.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    LOOKUP_CACHE.delete(key);
    return null;
  }

  return cached.result;
}

function setCachedValue(key, result) {
  LOOKUP_CACHE.set(key, {
    timestamp: Date.now(),
    result
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "libraryLookup") {
    return false;
  }

  void (async () => {
    try {
      const settings = await getSettings();
      const includeDebug = Boolean(message.includeDebug);
      const cacheKey = [
        settings.libraryName,
        settings.catalogBaseUrl,
        LibraryBrowser.bookMetadata.bestLookupKey(message.book),
        includeDebug ? "d:1" : "d:0"
      ].join("|");
      const cached = getCachedValue(cacheKey);

      if (cached) {
        sendResponse(cached);
        return;
      }

      const result = await LibraryBrowser.ocplPolarisConnector.lookup(message.book, settings, {
        includeDebug
      });
      setCachedValue(cacheKey, result);
      sendResponse(result);
    } catch (error) {
      sendResponse({
        status: "error",
        summary: "Lookup failed",
        detail: error instanceof Error ? error.message : "Unknown lookup error",
        actionUrl: "",
        libraryName: ""
      });
    }
  })();

  return true;
});
