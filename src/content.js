(function libraryBrowserContentScript(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const CARD_ID = "library-browser-card";

  function pickAdapter() {
    const url = new URL(window.location.href);
    return (app.siteAdapters || []).find((adapter) => adapter.matches(url));
  }

  function createCard() {
    const card = document.createElement("section");
    card.id = CARD_ID;
    card.className = "library-browser-card";
    card.innerHTML = `
      <div class="library-browser-card__eyebrow">Library Browser</div>
      <div class="library-browser-card__title">Checking your catalog…</div>
      <div class="library-browser-card__detail">Looking for a title and author match.</div>
      <ul class="library-browser-card__formats" hidden></ul>
      <details class="library-browser-card__debug" hidden>
        <summary class="library-browser-card__debug-summary">Lookup metadata (testing)</summary>
        <pre class="library-browser-card__debug-body"></pre>
      </details>
      <a class="library-browser-card__action" href="#" target="_blank" rel="noreferrer noopener">Open library search</a>
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
    return entry.label || "Format";
  }

  function renderResult(card, result, renderOptions) {
    const title = card.querySelector(".library-browser-card__title");
    const detail = card.querySelector(".library-browser-card__detail");
    const formatsList = card.querySelector(".library-browser-card__formats");
    const action = card.querySelector(".library-browser-card__action");
    const badge = card.querySelector(".library-browser-card__eyebrow");
    const debugBlock = card.querySelector(".library-browser-card__debug");
    const debugBody = card.querySelector(".library-browser-card__debug-body");

    badge.textContent = result.libraryName ? `${result.libraryName}` : "Library Browser";
    title.textContent = result.summary;
    detail.textContent = result.detail;

    if (Array.isArray(result.formats) && result.formats.length > 0) {
      formatsList.innerHTML = "";
      for (const entry of result.formats) {
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

    if (result.actionUrl) {
      action.href = result.actionUrl;
      action.hidden = false;
      action.textContent = result.status === "available_now" || result.status === "found"
        ? "Open catalog result"
        : "Search library catalog";
    } else {
      action.hidden = true;
    }

    card.dataset.status = result.status;

    const showDebug = Boolean(renderOptions && renderOptions.showMetadataDebug && result.debug);
    if (debugBlock && debugBody) {
      if (showDebug) {
        debugBlock.hidden = false;
        debugBody.textContent = JSON.stringify(result.debug, null, 2);
        console.log("[Library Browser]", result.debug);
      } else {
        debugBlock.hidden = true;
        debugBody.textContent = "";
      }
    }
  }

  async function run() {
    if (document.getElementById(CARD_ID)) {
      return;
    }

    const adapter = pickAdapter();
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
    mountTarget.prepend(card);

    const { showMetadataDebug = false } = await chrome.storage.sync.get({ showMetadataDebug: false });

    try {
      const result = await chrome.runtime.sendMessage({
        type: "libraryLookup",
        book,
        includeDebug: showMetadataDebug
      });

      renderResult(card, result, { showMetadataDebug });
    } catch (error) {
      renderResult(
        card,
        {
          status: "error",
          summary: "Lookup failed",
          detail: error instanceof Error ? error.message : "Unexpected error while checking the catalog.",
          actionUrl: "",
          libraryName: ""
        },
        { showMetadataDebug }
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    void run();
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
