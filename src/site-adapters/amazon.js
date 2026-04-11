(function registerAmazonAdapter(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const { normalizeWhitespace } = app.normalize;

  function textFromSelector(selectors) {
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

  function extractIsbn() {
    const detailBuckets = document.querySelectorAll("#detailBullets_feature_div, #bookDetails_feature_div, #detailBulletsWrapper_feature_div");

    for (const bucket of detailBuckets) {
      const text = bucket.textContent || "";
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
    id: "amazon",
    matches(url) {
      return /amazon\.com/i.test(url.hostname) && /\/(dp|gp\/product)\//i.test(url.href);
    },
    extract() {
      const title = textFromSelector([
        "#productTitle",
        "#ebooksProductTitle",
        "#title"
      ]);
      const author = textFromSelector([
        ".author .a-link-normal",
        "#bylineInfo .author a",
        "#bylineInfo"
      ]);
      const isbn = extractIsbn();

      if (!title) {
        return null;
      }

      return app.bookMetadata.toBookMetadata({
        title,
        author,
        isbn13: isbn.isbn13,
        isbn10: isbn.isbn10,
        sourceSite: "amazon",
        sourceUrl: window.location.href
      });
    },
    mountTarget() {
      return (
        document.querySelector("#centerCol") ||
        document.querySelector("#dp") ||
        document.body
      );
    }
  };

  app.siteAdapters = app.siteAdapters || [];
  app.siteAdapters.push(adapter);
})(typeof globalThis !== "undefined" ? globalThis : self);
