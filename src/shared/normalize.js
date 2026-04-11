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

  app.normalize = {
    normalizeWhitespace,
    normalizeText,
    normalizeIsbn,
    encodeTemplateValue
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
