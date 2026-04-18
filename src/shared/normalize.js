(function registerNormalization(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;

  function normalizeWhitespace(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeText(value) {
    return normalizeWhitespace(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .trim();
  }

  function normalizeIsbn(value) {
    return (value || "").replace(/[^0-9xX]/g, "").toUpperCase();
  }

  function encodeTemplateValue(value) {
    return encodeURIComponent(normalizeWhitespace(value));
  }

  /** Main segment before "Title: Subtitle" (colon + space); avoids "10:04"-style colons. */
  function primaryTitleBeforeSubtitle(value) {
    const t = normalizeWhitespace(value);
    const m = t.match(/^(.+?):\s+(.+)$/);
    if (!m) {
      return t;
    }
    const main = m[1].trim();
    const sub = m[2].trim();
    if (!main || !sub) {
      return t;
    }
    return main;
  }

  app.normalize = {
    normalizeWhitespace,
    normalizeText,
    normalizeIsbn,
    encodeTemplateValue,
    primaryTitleBeforeSubtitle
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
