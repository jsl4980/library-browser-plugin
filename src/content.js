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
      <a class="library-browser-card__action" href="#" target="_blank" rel="noreferrer noopener">Open library search</a>
    `;
    return card;
  }

  function renderResult(card, result) {
    const title = card.querySelector(".library-browser-card__title");
    const detail = card.querySelector(".library-browser-card__detail");
    const action = card.querySelector(".library-browser-card__action");
    const badge = card.querySelector(".library-browser-card__eyebrow");

    badge.textContent = result.libraryName ? `${result.libraryName}` : "Library Browser";
    title.textContent = result.summary;
    detail.textContent = result.detail;

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

    try {
      const result = await chrome.runtime.sendMessage({
        type: "libraryLookup",
        book
      });

      renderResult(card, result);
    } catch (error) {
      renderResult(card, {
        status: "error",
        summary: "Lookup failed",
        detail: error instanceof Error ? error.message : "Unexpected error while checking the catalog.",
        actionUrl: "",
        libraryName: ""
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    void run();
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
