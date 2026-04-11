const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPageFixture, loadTraceability } = require("./helpers/fixture-loader");
const { createPageHarness, assertTraceability } = require("./helpers/test-harness");

const { stories, testCases } = loadTraceability();
const pageCases = new Map(testCases.filter((testCase) => testCase.kind === "page").map((testCase) => [testCase.id, testCase]));

test("traceability registry covers all page integration tests", () => {
  for (const testCase of pageCases.values()) {
    assertTraceability({ stories, testCase });
  }
});

test("TC-US1-GOODREADS-RENDER renders a Goodreads availability card", async () => {
  const testCase = pageCases.get("TC-US1-GOODREADS-RENDER");
  const harness = createPageHarness({
    html: loadPageFixture("goodreads-book.html"),
    url: "https://www.goodreads.com/book/show/1-the-testable-library",
    runtimeResult: {
      status: "available_now",
      summary: "Available now at OCPL",
      detail: "The catalog page indicates at least one available copy.",
      actionUrl: "https://catalog.onlib.org/polaris/view.aspx?isbn=9781234567897",
      libraryName: "Onondaga County Public Library System"
    }
  });

  await new Promise((resolve) => setImmediate(resolve));
  const card = harness.getCard();

  assertTraceability({ stories, testCase });
  assert.ok(card, "Expected a library card to be inserted");
  assert.equal(card.dataset.status, testCase.expectedStatus);
  assert.equal(harness.sentMessages[0].book.title, "The Testable Library");
  assert.equal(harness.sentMessages[0].book.author, "Ada Example");
  assert.equal(harness.sentMessages[0].book.isbn13, "9781234567897");
});

test("TC-US2-AMAZON-RENDER renders an Amazon availability card", async () => {
  const testCase = pageCases.get("TC-US2-AMAZON-RENDER");
  const harness = createPageHarness({
    html: loadPageFixture("amazon-book.html"),
    url: "https://www.amazon.com/dp/testhold",
    runtimeResult: {
      status: "hold_available",
      summary: "Found at OCPL",
      detail: "The book appears in the catalog and may require a hold or sign-in for copy details.",
      actionUrl: "https://catalog.onlib.org/polaris/view.aspx?isbn=9781111111111",
      libraryName: "Onondaga County Public Library System"
    }
  });

  await new Promise((resolve) => setImmediate(resolve));
  const card = harness.getCard();

  assertTraceability({ stories, testCase });
  assert.ok(card, "Expected a library card to be inserted");
  assert.equal(card.dataset.status, testCase.expectedStatus);
  assert.equal(harness.sentMessages[0].book.title, "Waiting for Circulation");
  assert.equal(harness.sentMessages[0].book.author, "Nina Queue");
  assert.equal(harness.sentMessages[0].book.isbn13, "9781111111111");
});

test("TC-US4-CTA-LINK points to the OCPL catalog", async () => {
  const testCase = pageCases.get("TC-US4-CTA-LINK");
  const harness = createPageHarness({
    html: loadPageFixture("goodreads-book.html"),
    url: "https://www.goodreads.com/book/show/1-the-testable-library",
    runtimeResult: {
      status: "found",
      summary: "Found at OCPL",
      detail: "The book appears in the OCPL catalog.",
      actionUrl: "https://catalog.onlib.org/polaris/view.aspx?isbn=9781234567897",
      libraryName: "Onondaga County Public Library System"
    }
  });

  await new Promise((resolve) => setImmediate(resolve));
  const card = harness.getCard();
  const action = card.querySelector(".library-browser-card__action");

  assertTraceability({ stories, testCase });
  assert.equal(card.dataset.status, testCase.expectedStatus);
  assert.match(action.href, /^https:\/\/catalog\.onlib\.org\/polaris\//);
  assert.equal(action.textContent, "Open catalog result");
});

test("TC-US6-INCOMPLETE-METADATA degrades safely with missing author and ISBN", async () => {
  const testCase = pageCases.get("TC-US6-INCOMPLETE-METADATA");
  const harness = createPageHarness({
    html: loadPageFixture("goodreads-incomplete-metadata.html"),
    url: "https://www.goodreads.com/book/show/4-mystery-without-identifier",
    runtimeResult: {
      status: "not_found",
      summary: "Not found at OCPL",
      detail: "OCPL did not return a strong title, author, or ISBN match from the catalog search.",
      actionUrl: "https://catalog.onlib.org/polaris/view.aspx?keyword=Mystery%20Without%20Identifier",
      libraryName: "Onondaga County Public Library System"
    }
  });

  await new Promise((resolve) => setImmediate(resolve));
  const card = harness.getCard();

  assertTraceability({ stories, testCase });
  assert.ok(card, "Expected a library card even with incomplete metadata");
  assert.equal(card.dataset.status, testCase.expectedStatus);
  assert.equal(harness.sentMessages[0].book.title, "Mystery Without Identifier");
  assert.equal(harness.sentMessages[0].book.author, "");
  assert.equal(harness.sentMessages[0].book.isbn13, "");
});

test("TC-US7-PAGE-RENDER lists per-format availability on the card", async () => {
  const testCase = pageCases.get("TC-US7-PAGE-RENDER");
  const harness = createPageHarness({
    html: loadPageFixture("goodreads-book.html"),
    url: "https://www.goodreads.com/book/show/1-the-testable-library",
    runtimeResult: {
      status: "available_now",
      summary: "Available now at OCPL",
      detail: "Print book: Available now E-book: Hold or request Audiobook: Hold or request",
      actionUrl: "https://catalog.onlib.org/polaris/view.aspx?isbn=9781234567897",
      libraryName: "Onondaga County Public Library System",
      formats: [
        { bucket: "physical_book", label: "Book", availability: "available_now", hint: "Available now" },
        { bucket: "ebook", label: "E-book", availability: "hold_available", hint: "Hold or request" },
        { bucket: "audiobook", label: "Audiobook on CD", availability: "hold_available", hint: "Hold or request" }
      ]
    }
  });

  await new Promise((resolve) => setImmediate(resolve));
  const card = harness.getCard();
  const formatsList = card.querySelector(".library-browser-card__formats");
  const items = formatsList.querySelectorAll(".library-browser-card__format");

  assertTraceability({ stories, testCase });
  assert.ok(card, "Expected a library card to be inserted");
  assert.equal(card.dataset.status, testCase.expectedStatus);
  assert.equal(formatsList.hidden, false);
  assert.equal(items.length, 3);
  assert.match(items[0].textContent, /Print book/);
  assert.match(items[0].textContent, /Available now/);
  assert.match(items[1].textContent, /E-book/);
  assert.match(items[2].textContent, /Audiobook/);
});
