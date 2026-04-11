(function registerBookMetadata(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const { normalizeWhitespace, normalizeIsbn, normalizeText } = app.normalize;

  function toBookMetadata(input) {
    const title = normalizeWhitespace(input.title);
    const author = normalizeWhitespace(input.author);
    const isbn13 = normalizeIsbn(input.isbn13);
    const isbn10 = normalizeIsbn(input.isbn10);

    return {
      title,
      author,
      isbn13,
      isbn10,
      normalizedTitle: normalizeText(title),
      normalizedAuthor: normalizeText(author),
      sourceSite: input.sourceSite,
      sourceUrl: input.sourceUrl
    };
  }

  function bestLookupKey(book) {
    if (book.isbn13) {
      return `isbn13:${book.isbn13}`;
    }

    if (book.isbn10) {
      return `isbn10:${book.isbn10}`;
    }

    return `title:${book.normalizedTitle}|author:${book.normalizedAuthor}`;
  }

  app.bookMetadata = {
    toBookMetadata,
    bestLookupKey
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
