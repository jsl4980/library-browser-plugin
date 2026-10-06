(function registerAmazonAdapter(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const { normalizeWhitespace, primaryTitleBeforeSubtitle } = app.normalize;

  const DETAIL_ROW_SELECTOR = [
    "#detailBullets_feature_div li",
    "#detailBulletsWrapper_feature_div li",
    "#bookDetails_feature_div li",
    "#productDetails_detailBullets_sections1 tr",
    "#productDetails_detailBullets_sections1 li",
    "#prodDetails tr",
    "#prodDetails li",
    "#productDetails_db_sections tr",
    "#productDetails_db_sections li",
    "#audibleProductDetails li",
    "#audibleProductDetails_feature_div li",
    "[id^='rpi-attribute-book_details'] li",
    "[id^='rpi-attribute-book_details'] tr"
  ].join(", ");
  const BOOK_FORMAT_SELECTORS = ["#tmmSwatches", "#formats"];
  const BOOK_CATEGORY_SELECTORS = [
    "#wayfinding-breadcrumbs_feature_div",
    "#wayfinding-breadcrumbs_container"
  ];
  const BOOK_DETAIL_SELECTORS = [
    "#detailBullets_feature_div",
    "#bookDetails_feature_div",
    "#detailBulletsWrapper_feature_div",
    "#prodDetails",
    "#productDetails_detailBullets_sections1",
    "#productDetails_techSpec_section_1",
    "#productDetails_db_sections",
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
    /\bkindle edition\b/i,
    /\baudible audiobook\b/i
  ];
  const BOOK_DETAIL_PATTERNS = [
    /\bpublisher\b/i,
    /\bpublication date\b/i,
    /\bprint length\b/i,
    /\breading age\b/i,
    /\bgrade level\b/i,
    /\blexile measure\b/i,
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

  function detailRows() {
    return Array.from(document.querySelectorAll(DETAIL_ROW_SELECTOR));
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

  function normalizeDetailText(value) {
    return normalizeWhitespace(String(value || "").replace(/[\u200e\u200f\u00a0]/g, " "));
  }

  function isValidIsbn10(isbn) {
    if (!/^[0-9]{9}[0-9X]$/.test(isbn)) {
      return false;
    }

    let sum = 0;
    for (let index = 0; index < 10; index += 1) {
      const digit = isbn[index] === "X" ? 10 : Number(isbn[index]);
      sum += digit * (10 - index);
    }

    return sum % 11 === 0;
  }

  function isValidIsbn13(isbn) {
    if (!/^97[89][0-9]{10}$/.test(isbn)) {
      return false;
    }

    let sum = 0;
    for (let index = 0; index < 12; index += 1) {
      sum += Number(isbn[index]) * (index % 2 === 0 ? 1 : 3);
    }

    const check = (10 - (sum % 10)) % 10;
    return check === Number(isbn[12]);
  }

  function classifyIsbnValue(value) {
    const compact = normalizeIsbn(value);
    if (compact.length === 13 && isValidIsbn13(compact)) {
      return { isbn13: compact, isbn10: "" };
    }

    if (compact.length === 10 && isValidIsbn10(compact)) {
      return { isbn13: "", isbn10: compact };
    }

    return null;
  }

  function isbnFromRow(row) {
    const text = normalizeDetailText(row.textContent);
    const match = text.match(/^ISBN(?:-1[03])?\b\s*:?\s*(.+)$/i);
    if (!match) {
      return null;
    }

    return classifyIsbnValue(match[1]);
  }

  function extractIsbn() {
    let isbn13 = "";
    let isbn10 = "";

    for (const row of detailRows()) {
      const parsed = isbnFromRow(row);
      if (!parsed) {
        continue;
      }

      if (parsed.isbn13) {
        isbn13 = parsed.isbn13;
      }
      if (parsed.isbn10) {
        isbn10 = parsed.isbn10;
      }
    }

    return { isbn13, isbn10 };
  }

  function categoryEvidenceText() {
    const breadcrumbs = textFromSelectors(BOOK_CATEGORY_SELECTORS);
    const ranks = detailRows()
      .map((row) => normalizeDetailText(row.textContent))
      .filter((text) => /best sellers rank/i.test(text));

    return normalizeWhitespace([breadcrumbs, ...ranks].join(" "));
  }

  function isBookProduct(isbn) {
    if (isbn.isbn13 || isbn.isbn10) {
      return true;
    }

    const formatText = textFromSelectors(BOOK_FORMAT_SELECTORS);
    if (formatText && hasPattern(BOOK_FORMAT_PATTERNS, formatText)) {
      return true;
    }

    const categoryText = categoryEvidenceText();
    if (categoryText && hasPattern(BOOK_CATEGORY_PATTERNS, categoryText)) {
      return true;
    }

    const detailText = textFromSelectors(BOOK_DETAIL_SELECTORS);
    if (!detailText) {
      return false;
    }

    return countMatchingPatterns(BOOK_DETAIL_PATTERNS, detailText) >= 2;
  }

  const adapter = {
    id: "amazon",
    matches(url) {
      return /amazon\.com/i.test(url.hostname) && /\/(dp|gp\/product|exec\/obidos\/ASIN)\//i.test(url.href);
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
