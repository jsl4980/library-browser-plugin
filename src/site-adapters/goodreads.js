(function registerGoodreadsAdapter(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const { normalizeWhitespace } = app.normalize;

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

  const adapter = {
    id: "goodreads",
    matches(url) {
      return /goodreads\.com\/book\//i.test(url.href);
    },
    extract() {
      const title = getText([
        "[data-testid='bookTitle']",
        "h1.Text.Text__title1"
      ]);
      const author = getText([
        "[data-testid='name']",
        ".ContributorLink__name",
        ".AuthorPreview__name"
      ]);
      const isbn = getIsbnFromPage();

      if (!title) {
        return null;
      }

      return app.bookMetadata.toBookMetadata({
        title,
        author,
        isbn13: isbn.isbn13,
        isbn10: isbn.isbn10,
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
    }
  };

  app.siteAdapters = app.siteAdapters || [];
  app.siteAdapters.push(adapter);
})(typeof globalThis !== "undefined" ? globalThis : self);
