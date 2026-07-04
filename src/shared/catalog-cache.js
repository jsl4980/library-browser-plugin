(function registerCatalogCache(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;

  const RESULT_TTL_MS = 45 * 60 * 1000;
  const PAGE_TTL_MS = 60 * 60 * 1000;
  const MAX_PAGE_ENTRIES = 40;
  const MAX_PAGE_BYTES = 4 * 1024 * 1024;
  const MAX_RESULT_ENTRIES = 200;
  const DIAGNOSTICS_MAX = 50;
  const STORAGE_PAGES_KEY = "lbCatalogPages";
  const STORAGE_RESULTS_KEY = "lbLookupResults";
  const STORAGE_DIAGNOSTICS_KEY = "lbDiagnostics";

  const pageMemory = new Map();
  const resultMemory = new Map();
  const pageInflight = new Map();
  const resultInflight = new Map();
  let diagnostics = [];
  let hydrated = false;
  let hydratePromise = null;

  function now() {
    return Date.now();
  }

  function hasStorage() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  }

  async function ensureHydrated() {
    if (hydrated || !hasStorage()) {
      hydrated = true;
      return;
    }
    if (hydratePromise) {
      return hydratePromise;
    }

    hydratePromise = (async () => {
      try {
        const stored = await chrome.storage.local.get({
          [STORAGE_PAGES_KEY]: [],
          [STORAGE_RESULTS_KEY]: [],
          [STORAGE_DIAGNOSTICS_KEY]: []
        });
        for (const entry of stored[STORAGE_PAGES_KEY] || []) {
          if (entry && entry.key && entry.value && now() - entry.timestamp <= PAGE_TTL_MS) {
            pageMemory.set(entry.key, entry);
          }
        }
        for (const entry of stored[STORAGE_RESULTS_KEY] || []) {
          if (entry && entry.key && entry.value && now() - entry.timestamp <= RESULT_TTL_MS) {
            resultMemory.set(entry.key, entry);
          }
        }
        diagnostics = Array.isArray(stored[STORAGE_DIAGNOSTICS_KEY])
          ? stored[STORAGE_DIAGNOSTICS_KEY].slice(-DIAGNOSTICS_MAX)
          : [];
      } catch {
        // Memory-only if storage is unavailable.
      } finally {
        hydrated = true;
      }
    })();

    return hydratePromise;
  }

  function estimatePageBytes(entry) {
    const text = entry && entry.value && entry.value.text ? entry.value.text : "";
    return text.length * 2;
  }

  async function persistPages() {
    if (!hasStorage()) {
      return;
    }
    const entries = [...pageMemory.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_PAGE_ENTRIES);
    try {
      await chrome.storage.local.set({ [STORAGE_PAGES_KEY]: entries });
    } catch {
      // Ignore quota errors; memory cache still works.
    }
  }

  async function persistResults() {
    if (!hasStorage()) {
      return;
    }
    const entries = [...resultMemory.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RESULT_ENTRIES);
    try {
      await chrome.storage.local.set({ [STORAGE_RESULTS_KEY]: entries });
    } catch {
      // Ignore quota errors.
    }
  }

  async function persistDiagnostics() {
    if (!hasStorage()) {
      return;
    }
    try {
      await chrome.storage.local.set({ [STORAGE_DIAGNOSTICS_KEY]: diagnostics.slice(-DIAGNOSTICS_MAX) });
    } catch {
      // Ignore quota errors.
    }
  }

  function evictPages() {
    while (pageMemory.size > MAX_PAGE_ENTRIES) {
      const oldest = [...pageMemory.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (!oldest) {
        break;
      }
      pageMemory.delete(oldest[0]);
    }

    let totalBytes = 0;
    const ordered = [...pageMemory.entries()].sort((a, b) => b[1].timestamp - a[1].timestamp);
    for (const [key, entry] of ordered) {
      totalBytes += estimatePageBytes(entry);
      if (totalBytes > MAX_PAGE_BYTES) {
        pageMemory.delete(key);
      }
    }
  }

  function evictResults() {
    while (resultMemory.size > MAX_RESULT_ENTRIES) {
      const oldest = [...resultMemory.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (!oldest) {
        break;
      }
      resultMemory.delete(oldest[0]);
    }
  }

  async function getPage(requestUrl) {
    await ensureHydrated();
    const entry = pageMemory.get(requestUrl);
    if (!entry) {
      return { hit: false, page: null };
    }
    if (now() - entry.timestamp > PAGE_TTL_MS) {
      pageMemory.delete(requestUrl);
      return { hit: false, page: null };
    }
    return { hit: true, page: { url: entry.value.url, text: entry.value.text } };
  }

  async function setPage(requestUrl, page) {
    await ensureHydrated();
    if (!page || typeof page.text !== "string") {
      return;
    }
    pageMemory.set(requestUrl, {
      key: requestUrl,
      timestamp: now(),
      value: { url: page.url || requestUrl, text: page.text }
    });
    evictPages();
    void persistPages();
  }

  function getPageInflight(requestUrl) {
    return pageInflight.get(requestUrl) || null;
  }

  function setPageInflight(requestUrl, promise) {
    pageInflight.set(requestUrl, promise);
    const clear = () => {
      pageInflight.delete(requestUrl);
    };
    promise.then(clear, clear);
  }

  function shouldCacheResult(result) {
    if (!result || !result.status) {
      return false;
    }
    return result.status !== "error" && result.status !== "needs_setup";
  }

  async function getResult(cacheKey) {
    await ensureHydrated();
    const entry = resultMemory.get(cacheKey);
    if (!entry) {
      return { hit: false, result: null };
    }
    if (now() - entry.timestamp > RESULT_TTL_MS) {
      resultMemory.delete(cacheKey);
      return { hit: false, result: null };
    }
    return { hit: true, result: entry.value };
  }

  async function setResult(cacheKey, result) {
    await ensureHydrated();
    if (!shouldCacheResult(result)) {
      return;
    }
    resultMemory.set(cacheKey, {
      key: cacheKey,
      timestamp: now(),
      value: result
    });
    evictResults();
    void persistResults();
  }

  function getResultInflight(cacheKey) {
    return resultInflight.get(cacheKey) || null;
  }

  function setResultInflight(cacheKey, promise) {
    resultInflight.set(cacheKey, promise);
    const clear = () => {
      resultInflight.delete(cacheKey);
    };
    promise.then(clear, clear);
  }

  async function recordDiagnostic(entry) {
    await ensureHydrated();
    diagnostics.push({
      ...entry,
      timestamp: entry.timestamp || now()
    });
    if (diagnostics.length > DIAGNOSTICS_MAX) {
      diagnostics = diagnostics.slice(-DIAGNOSTICS_MAX);
    }
    void persistDiagnostics();
  }

  async function getDiagnostics() {
    await ensureHydrated();
    return diagnostics.slice();
  }

  function clearMemoryForTests() {
    pageMemory.clear();
    resultMemory.clear();
    pageInflight.clear();
    resultInflight.clear();
    diagnostics = [];
    hydrated = true;
    hydratePromise = null;
  }

  app.catalogCache = {
    RESULT_TTL_MS,
    PAGE_TTL_MS,
    getPage,
    setPage,
    getPageInflight,
    setPageInflight,
    getResult,
    setResult,
    getResultInflight,
    setResultInflight,
    shouldCacheResult,
    recordDiagnostic,
    getDiagnostics,
    clearMemoryForTests
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
