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
        <p class="library-browser-card__section-label">Related matches</p>
        <p class="library-browser-card__match-title library-browser-card__title"></p>
        <p class="library-browser-card__match-detail library-browser-card__detail"></p>
        <ul class="library-browser-card__match-formats library-browser-card__formats" hidden></ul>
        <a class="library-browser-card__match-action library-browser-card__action library-browser-card__action--related" href="#" target="_blank" rel="noreferrer noopener"></a>
      </div>
      <details class="library-browser-card__debug" hidden>
        <summary class="library-browser-card__debug-summary">Lookup metadata (testing)</summary>
        <pre class="library-browser-card__debug-body"></pre>
      </details>
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
    if (result.exactMatch) {
      exactLabel.hidden = false;
      fillMatchSection(exactWrap, result.exactMatch, "exact");
    } else {
      exactLabel.hidden = true;
      exactWrap.hidden = true;
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

  function renderResult(card, result, renderOptions) {
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
