(function libraryBrowserContentScript(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const CARD_ID = "library-browser-card";
  const POPUP_ID = "library-browser-popup";
  const BADGE_CLASS = "library-browser-badge";
  const LIST_CONCURRENCY = 3;
  const ERROR_BACKOFF_MS = 15000;

  let showMetadataDebug = false;
  let activePopup = null;
  let activeBadge = null;
  let listAbortToken = 0;
  let consecutiveErrors = 0;
  let backoffUntil = 0;
  const trackedEntries = new WeakMap();
  let intersectionObserver = null;
  let mutationObserver = null;
  let lastHref = "";

  function pickDetailAdapter() {
    const url = new URL(window.location.href);
    return (app.siteAdapters || []).find((adapter) => adapter.matches(url));
  }

  function pickGoodreadsAdapter() {
    const url = new URL(window.location.href);
    return (app.siteAdapters || []).find(
      (adapter) => adapter.id === "goodreads" && adapter.matchesSite && adapter.matchesSite(url)
    );
  }

  function createCard() {
    const card = document.createElement("section");
    card.className = "library-browser-card";
    card.innerHTML = `
      <div class="library-browser-card__eyebrow">Library Browser</div>
      <div class="library-browser-card__legacy">
        <p class="library-browser-card__legacy-title library-browser-card__title">Checking your catalog…</p>
        <p class="library-browser-card__legacy-detail library-browser-card__detail">Looking for a title and author match.</p>
        <ul class="library-browser-card__legacy-formats library-browser-card__formats" hidden></ul>
        <a class="library-browser-card__legacy-action library-browser-card__action" href="#" target="_blank" rel="noreferrer noopener">Open library search</a>
      </div>
      <div class="library-browser-card__match library-browser-card__match--exact" hidden>
        <p class="library-browser-card__section-label">Exact match</p>
        <p class="library-browser-card__match-title library-browser-card__title"></p>
        <p class="library-browser-card__match-detail library-browser-card__detail"></p>
        <ul class="library-browser-card__match-formats library-browser-card__formats" hidden></ul>
        <a class="library-browser-card__match-action library-browser-card__action library-browser-card__action--exact" href="#" target="_blank" rel="noreferrer noopener"></a>
      </div>
      <div class="library-browser-card__match library-browser-card__match--related" hidden>
        <p class="library-browser-card__section-label">Other editions</p>
        <p class="library-browser-card__match-title library-browser-card__title"></p>
        <p class="library-browser-card__match-detail library-browser-card__detail"></p>
        <ul class="library-browser-card__match-formats library-browser-card__formats" hidden></ul>
        <a class="library-browser-card__match-action library-browser-card__action library-browser-card__action--related" href="#" target="_blank" rel="noreferrer noopener"></a>
      </div>
      <details class="library-browser-card__debug" hidden>
        <summary class="library-browser-card__debug-summary">Lookup metadata (testing)</summary>
        <pre class="library-browser-card__debug-body"></pre>
      </details>
      <button type="button" class="library-browser-card__copy-diagnostics" hidden>Copy diagnostics</button>
    `;
    return card;
  }

  function formatDisplayName(entry) {
    if (entry.bucket === "physical_book") {
      return "Print book";
    }
    if (entry.bucket === "ebook") {
      return "E-book";
    }
    if (entry.bucket === "audiobook") {
      return "Audiobook";
    }
    if (entry.bucket === "other") {
      return "Other formats";
    }
    return entry.label || "Format";
  }

  function applyDetailWithoutFormatDuplication(detailEl, detailText, formats) {
    const hasFormats = Array.isArray(formats) && formats.length > 0;
    if (hasFormats) {
      detailEl.textContent = "";
      detailEl.hidden = true;
    } else {
      detailEl.hidden = false;
      detailEl.textContent = detailText;
    }
  }

  function renderFormatsList(formatsList, formats) {
    if (Array.isArray(formats) && formats.length > 0) {
      formatsList.innerHTML = "";
      for (const entry of formats) {
        const li = document.createElement("li");
        li.className = "library-browser-card__format";
        li.dataset.availability = entry.availability;
        const count = entry.count;
        li.textContent =
          typeof count === "number" && Number.isFinite(count)
            ? `${formatDisplayName(entry)} (${count})`
            : `${formatDisplayName(entry)} — ${entry.hint}`;
        formatsList.appendChild(li);
      }
      formatsList.hidden = false;
    } else {
      formatsList.innerHTML = "";
      formatsList.hidden = true;
    }
  }

  function legacyActionLabel(block) {
    if (!block.actionUrl) {
      return "Open library search";
    }
    return block.status === "available_now" || block.status === "found"
      ? "Open catalog result"
      : "Search library catalog";
  }

  function exactActionLabel() {
    return "View exact match in catalog";
  }

  function relatedActionLabel(block) {
    if (block.relatedUsedAuthor) {
      return "View title & author search in catalog";
    }
    return "View related catalog search";
  }

  function fillMatchSection(wrap, block, kind) {
    if (!block) {
      wrap.hidden = true;
      return;
    }

    wrap.hidden = false;
    const title = wrap.querySelector(".library-browser-card__match-title");
    const detail = wrap.querySelector(".library-browser-card__match-detail");
    const formatsList = wrap.querySelector(".library-browser-card__match-formats");
    const action = wrap.querySelector(".library-browser-card__match-action");

    title.textContent = block.summary;
    renderFormatsList(formatsList, block.formats);
    applyDetailWithoutFormatDuplication(detail, block.detail, block.formats);

    if (block.actionUrl) {
      action.href = block.actionUrl;
      action.hidden = false;
      action.textContent = kind === "exact" ? exactActionLabel() : relatedActionLabel(block);
    } else {
      action.hidden = true;
    }
  }

  function renderStructuredCard(card, result) {
    const legacy = card.querySelector(".library-browser-card__legacy");
    const exactWrap = card.querySelector(".library-browser-card__match--exact");
    const relatedWrap = card.querySelector(".library-browser-card__match--related");

    legacy.hidden = true;
    exactWrap.hidden = false;
    relatedWrap.hidden = false;

    const exactLabel = exactWrap.querySelector(".library-browser-card__section-label");
    const relatedLabel = relatedWrap.querySelector(".library-browser-card__section-label");
    if (result.exactMatch) {
      exactLabel.hidden = false;
      fillMatchSection(exactWrap, result.exactMatch, "exact");
    } else {
      exactLabel.hidden = true;
      exactWrap.hidden = true;
    }

    if (relatedLabel) {
      relatedLabel.hidden = !result.exactMatch || !result.relatedMatch;
    }
    fillMatchSection(relatedWrap, result.relatedMatch, "related");
  }

  function renderLegacyCard(card, result) {
    const legacy = card.querySelector(".library-browser-card__legacy");
    const exactWrap = card.querySelector(".library-browser-card__match--exact");
    const relatedWrap = card.querySelector(".library-browser-card__match--related");

    legacy.hidden = false;
    exactWrap.hidden = true;
    relatedWrap.hidden = true;

    const title = legacy.querySelector(".library-browser-card__legacy-title");
    const detail = legacy.querySelector(".library-browser-card__legacy-detail");
    const formatsList = legacy.querySelector(".library-browser-card__legacy-formats");
    const action = legacy.querySelector(".library-browser-card__legacy-action");

    title.textContent = result.summary;
    renderFormatsList(formatsList, result.formats);
    applyDetailWithoutFormatDuplication(detail, result.detail, result.formats);

    if (result.actionUrl) {
      action.href = result.actionUrl;
      action.hidden = false;
      action.textContent = legacyActionLabel(result);
    } else {
      action.hidden = true;
    }
  }

  function buildDiagnosticsPayload({ mode, book, result }) {
    const manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : { version: "unknown" };
    return {
      version: manifest.version,
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
      mode,
      book: {
        title: book.title || "",
        author: book.author || "",
        isbn13: book.isbn13 || "",
        isbn10: book.isbn10 || "",
        goodreadsId: book.goodreadsId || "",
        sourceSite: book.sourceSite || "",
        sourceUrl: book.sourceUrl || ""
      },
      result: {
        status: result.status,
        summary: result.summary,
        detail: result.detail,
        libraryName: result.libraryName || "",
        actionUrl: result.actionUrl || ""
      },
      cache: result.cache || null,
      debug: result.debug || null
    };
  }

  function wireCopyDiagnostics(card, context) {
    const button = card.querySelector(".library-browser-card__copy-diagnostics");
    if (!button) {
      return;
    }

    const showCopy =
      showMetadataDebug ||
      context.result.status === "error" ||
      context.result.status === "needs_setup";
    button.hidden = !showCopy;
    button.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = JSON.stringify(buildDiagnosticsPayload(context), null, 2);
      try {
        await navigator.clipboard.writeText(payload);
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = "Copy diagnostics";
        }, 1500);
      } catch {
        button.textContent = "Copy failed";
      }
    };
  }

  function renderResult(card, result, renderOptions, context) {
    const badge = card.querySelector(".library-browser-card__eyebrow");
    const debugBlock = card.querySelector(".library-browser-card__debug");
    const debugBody = card.querySelector(".library-browser-card__debug-body");

    badge.textContent = result.libraryName ? `${result.libraryName}` : "Library Browser";

    const structured = Boolean(result.exactMatch || result.relatedMatch);
    if (structured) {
      renderStructuredCard(card, result);
    } else {
      renderLegacyCard(card, result);
    }

    card.dataset.status = result.status;

    const showDebug = Boolean(renderOptions && renderOptions.showMetadataDebug && result.debug);
    if (debugBlock && debugBody) {
      if (showDebug) {
        debugBlock.hidden = false;
        debugBody.textContent = JSON.stringify(result.debug, null, 2);
        if (context && context.mode === "list" && context.book) {
          console.log("[Library Browser]", context.book.goodreadsId || context.book.title, result.status, result.debug);
        } else {
          console.log("[Library Browser]", result.debug);
        }
      } else {
        debugBlock.hidden = true;
        debugBody.textContent = "";
      }
    }

    if (context) {
      wireCopyDiagnostics(card, { ...context, result });
    }
  }

  async function libraryLookup(book, mode) {
    return chrome.runtime.sendMessage({
      type: "libraryLookup",
      book,
      mode,
      pageUrl: window.location.href,
      includeDebug: showMetadataDebug
    });
  }

  function statusToBadgeTone(status) {
    if (status === "available_now") {
      return "available";
    }
    if (status === "hold_available" || status === "found") {
      return "catalog";
    }
    if (status === "not_found") {
      return "missing";
    }
    return "error";
  }

  function statusLabel(status) {
    if (status === "available_now") {
      return "Available now at your library";
    }
    if (status === "hold_available" || status === "found") {
      return "In your library catalog";
    }
    if (status === "not_found") {
      return "Not found in your library catalog";
    }
    if (status === "needs_setup") {
      return "Library catalog setup needed";
    }
    return "Library lookup error";
  }

  function closePopup() {
    if (activePopup && activePopup.parentNode) {
      activePopup.parentNode.removeChild(activePopup);
    }
    activePopup = null;
    activeBadge = null;
  }

  function positionPopup(popup, badge) {
    const rect = badge.getBoundingClientRect();
    const popupWidth = 320;
    const margin = 8;
    let left = rect.right - popupWidth;
    let top = rect.top - 8;

    popup.style.visibility = "hidden";
    popup.style.display = "block";
    document.documentElement.appendChild(popup);
    const height = popup.offsetHeight || 240;

    if (top - height < margin) {
      top = rect.bottom + margin;
    } else {
      top = top - height;
    }

    if (left < margin) {
      left = margin;
    }
    if (left + popupWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - popupWidth - margin);
    }
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - height - margin);
    }
    if (top < margin) {
      top = margin;
    }

    popup.style.position = "fixed";
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
    popup.style.zIndex = "2147483646";
    popup.style.visibility = "visible";
  }

  function openPopupForEntry(badge, entryState) {
    if (activeBadge === badge && activePopup) {
      closePopup();
      return;
    }

    closePopup();

    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    popup.className = "library-browser-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-label", "Library availability");

    const card = createCard();
    renderResult(card, entryState.result, { showMetadataDebug }, {
      mode: "list",
      book: entryState.book,
      result: entryState.result
    });
    popup.appendChild(card);
    positionPopup(popup, badge);

    activePopup = popup;
    activeBadge = badge;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closePopup();
        document.removeEventListener("keydown", onKeyDown, true);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    const onPointerDown = (event) => {
      if (activePopup && !activePopup.contains(event.target) && event.target !== badge) {
        closePopup();
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("keydown", onKeyDown, true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
  }

  function createBadge(entryState) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BADGE_CLASS;
    button.dataset.status = entryState.result.status;
    button.dataset.tone = statusToBadgeTone(entryState.result.status);
    button.setAttribute("aria-label", statusLabel(entryState.result.status));
    button.title = statusLabel(entryState.result.status);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPopupForEntry(button, entryState);
    });
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    return button;
  }

  function attachBadge(entry, result) {
    const existing = entry.mountRoot.querySelector(`.${BADGE_CLASS}`);
    if (existing) {
      existing.remove();
    }

    const entryState = { book: entry.book, result };
    const badge = createBadge(entryState);
    entry.mountRoot.appendChild(badge);
    trackedEntries.set(entry.mountRoot, { ...entry, result, badge });
  }

  async function runDetail() {
    if (document.getElementById(CARD_ID)) {
      return;
    }

    const adapter = pickDetailAdapter();
    if (!adapter) {
      return;
    }

    const book = adapter.extract();
    if (!book) {
      return;
    }

    const mountTarget = adapter.mountTarget();
    if (!mountTarget) {
      return;
    }

    const card = createCard();
    card.id = CARD_ID;
    mountTarget.prepend(card);

    try {
      const result = await libraryLookup(book, "detail");
      renderResult(card, result, { showMetadataDebug }, { mode: "detail", book, result });
    } catch (error) {
      const result = {
        status: "error",
        summary: "Lookup failed",
        detail: error instanceof Error ? error.message : "Unexpected error while checking the catalog.",
        actionUrl: "",
        libraryName: ""
      };
      renderResult(card, result, { showMetadataDebug }, { mode: "detail", book, result });
    }
  }

  function createQueue(concurrency) {
    let active = 0;
    const queue = [];

    function pump() {
      while (active < concurrency && queue.length) {
        const job = queue.shift();
        active += 1;
        Promise.resolve()
          .then(job.fn)
          .then(job.resolve, job.reject)
          .finally(() => {
            active -= 1;
            pump();
          });
      }
    }

    return function enqueue(fn) {
      return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        pump();
      });
    };
  }

  const enqueueLookup = createQueue(LIST_CONCURRENCY);

  async function lookupEntry(entry, token) {
    if (token !== listAbortToken) {
      return;
    }
    if (Date.now() < backoffUntil) {
      return;
    }
    if (trackedEntries.get(entry.mountRoot)?.result) {
      return;
    }

    try {
      const result = await enqueueLookup(() => libraryLookup(entry.book, "list"));
      if (token !== listAbortToken) {
        return;
      }

      if (result.status === "error") {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 5) {
          backoffUntil = Date.now() + ERROR_BACKOFF_MS;
          consecutiveErrors = 0;
        }
      } else {
        consecutiveErrors = 0;
      }

      attachBadge(entry, result);
    } catch (error) {
      if (token !== listAbortToken) {
        return;
      }
      consecutiveErrors += 1;
      if (consecutiveErrors >= 5) {
        backoffUntil = Date.now() + ERROR_BACKOFF_MS;
        consecutiveErrors = 0;
      }
      attachBadge(entry, {
        status: "error",
        summary: "Lookup failed",
        detail: error instanceof Error ? error.message : "Unexpected error while checking the catalog.",
        actionUrl: "",
        libraryName: ""
      });
    }
  }

  function ensureIntersectionObserver(token) {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }

    if (typeof IntersectionObserver !== "function") {
      return {
        observe(entry) {
          void lookupEntry(entry, token);
        }
      };
    }

    intersectionObserver = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) {
            continue;
          }
          const entry = record.target.__libraryBrowserEntry;
          if (entry) {
            void lookupEntry(entry, token);
            intersectionObserver.unobserve(record.target);
          }
        }
      },
      { root: null, rootMargin: "200px 0px", threshold: 0.01 }
    );

    return {
      observe(entry) {
        entry.mountRoot.__libraryBrowserEntry = entry;
        intersectionObserver.observe(entry.mountRoot);
      }
    };
  }

  function scanListEntries(token) {
    const adapter = pickGoodreadsAdapter();
    if (!adapter || !adapter.discoverBookEntries) {
      return;
    }

    const observer = ensureIntersectionObserver(token);
    const entries = adapter.discoverBookEntries(document);
    for (const entry of entries) {
      if (entry.mountRoot.querySelector(`.${BADGE_CLASS}`)) {
        continue;
      }
      observer.observe(entry);
    }
  }

  function resetListMode() {
    listAbortToken += 1;
    closePopup();
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
    for (const badge of document.querySelectorAll(`.${BADGE_CLASS}`)) {
      badge.remove();
    }
  }

  function startListMode() {
    const adapter = pickGoodreadsAdapter();
    if (!adapter) {
      return;
    }

    const token = listAbortToken;
    scanListEntries(token);

    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    let debounceTimer = null;
    mutationObserver = new MutationObserver(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        if (token !== listAbortToken) {
          return;
        }
        scanListEntries(token);
      }, 300);
    });

    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function onRouteMaybeChanged() {
    const href = window.location.href;
    if (href === lastHref) {
      return;
    }
    lastHref = href;
    resetListMode();
    const existingCard = document.getElementById(CARD_ID);
    if (existingCard) {
      existingCard.remove();
    }
    void runDetail();
    startListMode();
  }

  function installSpaHooks() {
    lastHref = window.location.href;
    window.addEventListener("popstate", onRouteMaybeChanged);

    if (typeof history !== "undefined" && typeof history.pushState === "function") {
      const originalPushState = history.pushState.bind(history);
      const originalReplaceState = history.replaceState.bind(history);
      history.pushState = function pushStatePatched(...args) {
        const result = originalPushState(...args);
        onRouteMaybeChanged();
        return result;
      };
      history.replaceState = function replaceStatePatched(...args) {
        const result = originalReplaceState(...args);
        onRouteMaybeChanged();
        return result;
      };
    }

    if (typeof setInterval === "function") {
      setInterval(() => {
        if (window.location.href !== lastHref) {
          onRouteMaybeChanged();
        }
      }, 1500);
    }
  }

  async function boot() {
    const settings = await chrome.storage.sync.get({ showMetadataDebug: false });
    showMetadataDebug = Boolean(settings.showMetadataDebug);

    await runDetail();

    const goodreads = pickGoodreadsAdapter();
    if (goodreads) {
      startListMode();
      installSpaHooks();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void boot();
    }, { once: true });
  } else {
    void boot();
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
