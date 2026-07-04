(function registerGoodreadsAdapter(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const { normalizeWhitespace, cleanBookTitle } = app.normalize;

  function getText(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent) {
        const text = normalizeWhitespace(element.textContent);
        if (text) {
          return text;
        }
      }
    }

    return "";
  }

  function getIsbnFromPage() {
    const candidates = [
      ...document.querySelectorAll("[data-testid='bookInfo'] *"),
      ...document.querySelectorAll(".FeaturedDetails *"),
      ...document.querySelectorAll("script[type='application/ld+json']")
    ];

    for (const node of candidates) {
      const text = node.textContent || "";
      const match13 = text.match(/\b97[89][0-9]{10}\b/);
      if (match13) {
        return { isbn13: match13[0], isbn10: "" };
      }

      const match10 = text.match(/\b[0-9Xx]{10}\b/);
      if (match10) {
        return { isbn13: "", isbn10: match10[0] };
      }
    }

    return { isbn13: "", isbn10: "" };
  }

  function parseBookShowId(href) {
    if (!href) {
      return "";
    }
    try {
      const url = new URL(href, window.location.origin);
      const match = url.pathname.match(/\/book\/show\/(\d+)/i);
      return match ? match[1] : "";
    } catch {
      const match = String(href).match(/\/book\/show\/(\d+)/i);
      return match ? match[1] : "";
    }
  }

  function mainBookIdFromLocation() {
    return parseBookShowId(window.location.href);
  }

  function isPlausibleCoverImage(img) {
    if (!img) {
      return false;
    }
    const width = Number(img.getAttribute("width") || img.width || 0);
    const height = Number(img.getAttribute("height") || img.height || 0);
    if (width && width < 40) {
      return false;
    }
    if (height && height < 40) {
      return false;
    }
    const className = img.className || "";
    if (/avatar|icon|emoji|badge/i.test(className)) {
      return false;
    }
    return true;
  }

  function findCoverImage(anchor) {
    if (anchor.querySelector) {
      const nested = anchor.querySelector("img");
      if (isPlausibleCoverImage(nested)) {
        return nested;
      }
    }

    const parent = anchor.parentElement;
    if (parent && parent.querySelector) {
      const siblingImg = parent.querySelector("img");
      if (isPlausibleCoverImage(siblingImg)) {
        return siblingImg;
      }
    }

    return null;
  }

  function resolveMountRoot(anchor, coverImg) {
    if (coverImg) {
      const parent = coverImg.parentElement;
      if (parent) {
        const style = window.getComputedStyle ? window.getComputedStyle(parent) : null;
        if (!style || style.position === "static") {
          parent.style.position = "relative";
        }
        return parent;
      }
    }

    const parent = anchor.parentElement;
    if (parent) {
      const style = window.getComputedStyle ? window.getComputedStyle(parent) : null;
      if (!style || style.position === "static") {
        parent.style.position = "relative";
      }
      return parent;
    }

    return null;
  }

  function extractTitleFromAnchor(anchor, coverImg) {
    const aria = normalizeWhitespace(anchor.getAttribute("aria-label") || "");
    if (aria) {
      return cleanBookTitle(aria.replace(/\s+by\s+.+$/i, ""));
    }

    const imgAlt = coverImg ? normalizeWhitespace(coverImg.getAttribute("alt") || "") : "";
    if (imgAlt && !/^cover$/i.test(imgAlt)) {
      return cleanBookTitle(imgAlt.replace(/\s+by\s+.+$/i, ""));
    }

    const spanName = anchor.querySelector && anchor.querySelector("[itemprop='name'], .bookTitle");
    if (spanName && spanName.textContent) {
      return cleanBookTitle(spanName.textContent);
    }

    const text = normalizeWhitespace(anchor.textContent || "");
    if (text && text.length < 200) {
      return cleanBookTitle(text);
    }

    return "";
  }

  function extractAuthorNear(anchor) {
    const row =
      (anchor.closest &&
        (anchor.closest("tr") ||
          anchor.closest(".elementList") ||
          anchor.closest(".bookBox") ||
          anchor.closest("li") ||
          anchor.closest("article"))) ||
      anchor.parentElement;

    if (!row || !row.querySelector) {
      return "";
    }

    const authorNode = row.querySelector(
      ".authorName span, .authorName, [itemprop='author'], a[href*='/author/show/']"
    );
    if (authorNode && authorNode.textContent) {
      return normalizeWhitespace(authorNode.textContent);
    }

    return "";
  }

  function discoverBookEntries(doc) {
    const root = doc || document;
    const anchors = [...root.querySelectorAll('a[href*="/book/show/"]')];
    const mainBookId = mainBookIdFromLocation();
    const seenMounts = new WeakSet();
    const seenIds = new Set();
    const entries = [];

    // Prefer anchors that wrap a cover image so we mount on artwork, not title text.
    anchors.sort((left, right) => {
      const leftCover = findCoverImage(left) ? 0 : 1;
      const rightCover = findCoverImage(right) ? 0 : 1;
      return leftCover - rightCover;
    });

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") || anchor.href || "";
      const goodreadsId = parseBookShowId(href);
      if (!goodreadsId || seenIds.has(goodreadsId)) {
        continue;
      }

      if (mainBookId && goodreadsId === mainBookId) {
        continue;
      }

      const coverImg = findCoverImage(anchor);
      if (!coverImg && !(anchor.closest && anchor.closest("tr[itemscope], .bookBox, .elementList"))) {
        continue;
      }

      const mountRoot = resolveMountRoot(anchor, coverImg);
      if (!mountRoot || seenMounts.has(mountRoot)) {
        continue;
      }

      const title = extractTitleFromAnchor(anchor, coverImg);
      if (!title) {
        continue;
      }

      const author = extractAuthorNear(anchor);
      let sourceUrl = href;
      try {
        sourceUrl = new URL(href, window.location.origin).href;
      } catch {
        // keep href
      }

      seenMounts.add(mountRoot);
      seenIds.add(goodreadsId);
      entries.push({
        goodreadsId,
        mountRoot,
        book: app.bookMetadata.toBookMetadata({
          title,
          author,
          isbn13: "",
          isbn10: "",
          goodreadsId,
          sourceSite: "goodreads",
          sourceUrl
        })
      });
    }

    return entries;
  }

  const adapter = {
    id: "goodreads",
    matches(url) {
      return /goodreads\.com\/book\//i.test(url.href);
    },
    matchesSite(url) {
      return /goodreads\.com/i.test(url.hostname || url.href);
    },
    extract() {
      const title = cleanBookTitle(
        getText(["[data-testid='bookTitle']", "h1.Text.Text__title1"])
      );
      const author = getText([
        "[data-testid='name']",
        ".ContributorLink__name",
        ".AuthorPreview__name"
      ]);
      const isbn = getIsbnFromPage();
      const goodreadsId = mainBookIdFromLocation();

      if (!title) {
        return null;
      }

      return app.bookMetadata.toBookMetadata({
        title,
        author,
        isbn13: isbn.isbn13,
        isbn10: isbn.isbn10,
        goodreadsId,
        sourceSite: "goodreads",
        sourceUrl: window.location.href
      });
    },
    mountTarget() {
      return (
        document.querySelector("[data-testid='BookPageTitleSection']") ||
        document.querySelector(".BookPageMetadataSection") ||
        document.querySelector("main")
      );
    },
    discoverBookEntries
  };

  app.siteAdapters = app.siteAdapters || [];
  app.siteAdapters.push(adapter);
})(typeof globalThis !== "undefined" ? globalThis : self);
