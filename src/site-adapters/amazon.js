(function registerAmazonAdapter(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const { normalizeWhitespace, primaryTitleBeforeSubtitle } = app.normalize;

  const BOOK_EVIDENCE_SELECTORS = [
    "#detailBullets_feature_div",
    "#bookDetails_feature_div",
    "#detailBulletsWrapper_feature_div",
    "#prodDetails",
    "#productDetails_detailBullets_sections1",
    "#productDetails_techSpec_section_1",
    "#productDetails_db_sections",
    "#productOverview_feature_div",
    "#wayfinding-breadcrumbs_feature_div",
    "#wayfinding-breadcrumbs_container",
    "#tmmSwatches",
    "#formats",
    "#audibleProductDetails",
    "#audibleProductDetails_feature_div",
    "[id^='rpi-attribute-book_details']"
  ];
  const BOOK_CATEGORY_PATTERNS = [
    /\bbooks\b/i,
    /\bkindle store\b/i,
    /\bkindle ebooks\b/i,
    /\baudible books(?:\s*(?:&|and)\s*originals)?\b/i
  ];
  const BOOK_FORMAT_PATTERNS = [
    /\bhardcover\b/i,
    /\bpaperback\b/i,
    /\bmass market paperback\b/i,
    /\bboard book\b/i,
    /\blibrary binding\b/i,
    /\bkindle(?: edition)?\b/i,
    /\baudible audiobook\b/i,
    /\baudio cd\b/i,
    /\bmp3 cd\b/i
  ];
  const BOOK_DETAIL_PATTERNS = [
    /\bisbn-1[03]\b/i,
    /\bpublisher\b/i,
    /\bpublication date\b/i,
    /\bprint length\b/i,
    /\blanguage\b/i,
    /\breading age\b/i,
    /\bgrade level\b/i,
    /\blexile measure\b/i,
    /\bfile size\b/i,
    /\btext-to-speech\b/i,
    /\bscreen reader\b/i,
    /\benhanced typesetting\b/i,
    /\blistening length\b/i,
    /\baudible\.com release date\b/i,
    /\bprogram type\b/i,
    /\bwhispersync for voice\b/i
  ];

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

  function textFromSelectors(selectors) {
    return normalizeWhitespace(
      selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .map((element) => element.textContent || "")
        .join(" ")
    );
  }

  function hasPattern(patterns, text) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function countMatchingPatterns(patterns, text) {
    return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  }

  function normalizeIsbn(value) {
    return value.replace(/[^0-9Xx]/g, "").toUpperCase();
  }

  function extractIsbn() {
    const detailBuckets = document.querySelectorAll(
      "#detailBullets_feature_div, #bookDetails_feature_div, #detailBulletsWrapper_feature_div, #productDetails_detailBullets_sections1, #prodDetails"
    );

    for (const bucket of detailBuckets) {
      const text = bucket.textContent || "";
      const match13 = text.match(/\b97[89](?:[\s-]?[0-9]){10}\b/);
      if (match13) {
        return { isbn13: normalizeIsbn(match13[0]), isbn10: "" };
      }

      const match10 = text.match(/\b[0-9](?:[\s-]?[0-9]){8}[\s-]?[0-9Xx]\b/);
      if (match10) {
        return { isbn13: "", isbn10: normalizeIsbn(match10[0]) };
      }
    }

    return { isbn13: "", isbn10: "" };
  }

  function hasAmazonBookAuthor() {
    return Boolean(document.querySelector(".author .a-link-normal, #bylineInfo .author a, #bylineInfo .author"));
  }

  function isBookProduct(isbn) {
    if (isbn.isbn13 || isbn.isbn10) {
      return true;
    }

    const evidenceText = textFromSelectors(BOOK_EVIDENCE_SELECTORS);
    if (!evidenceText) {
      return false;
    }

    if (hasPattern(BOOK_CATEGORY_PATTERNS, evidenceText) || hasPattern(BOOK_FORMAT_PATTERNS, evidenceText)) {
      return true;
    }

    const detailSignals = countMatchingPatterns(BOOK_DETAIL_PATTERNS, evidenceText);
    return detailSignals >= 2 || (hasAmazonBookAuthor() && detailSignals >= 1);
  }

  const adapter = {
    id: "amazon",
    matches(url) {
      return /amazon\.com/i.test(url.hostname) && /\/(dp|gp\/product)\//i.test(url.href);
    },
    extract() {
      const title = primaryTitleBeforeSubtitle(
        textFromSelector([
          "#productTitle",
          "#ebooksProductTitle",
          "#title"
        ])
      );
      const author = textFromSelector([
        ".author .a-link-normal",
        "#bylineInfo .author a",
        "#bylineInfo"
      ]);
      const isbn = extractIsbn();

      if (!title || !isBookProduct(isbn)) {
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
