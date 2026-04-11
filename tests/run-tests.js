const assert = require("node:assert/strict");
const { loadOcplFixtures, loadPageFixture, loadTraceability } = require("./helpers/fixture-loader");
const { createConnectorHarness, createPageHarness, assertTraceability } = require("./helpers/test-harness");

async function run(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  }
}

async function main() {
  const { stories, testCases } = loadTraceability();
  const fixtures = new Map(loadOcplFixtures().map((fixture) => [fixture.id, fixture]));
  const connectorCases = testCases.filter((testCase) => testCase.kind === "connector" && testCase.source === "fixture");
  const pageCases = new Map(testCases.filter((testCase) => testCase.kind === "page").map((testCase) => [testCase.id, testCase]));

  await run("traceability registry covers all connector fixture tests", async () => {
    for (const testCase of connectorCases) {
      assertTraceability({ stories, testCase });
      assert.ok(fixtures.has(testCase.fixtureId), `${testCase.id} is missing fixture ${testCase.fixtureId}`);
    }
  });

  for (const testCase of connectorCases) {
    await run(`${testCase.id} -> ${testCase.expectedStatus}`, async () => {
      const fixture = fixtures.get(testCase.fixtureId);
      const requests = [];
      const harness = createConnectorHarness({
        fetchImpl: async (url) => {
          requests.push(url.toString());
          return {
            ok: fixture.responseStatus >= 200 && fixture.responseStatus < 300,
            status: fixture.responseStatus,
            async text() {
              return fixture.responseBody;
            }
          };
        }
      });

      const book = harness.toBookMetadata(fixture.book);
      const result = await harness.connector.lookup(book, {
        libraryName: "Onondaga County Public Library System",
        catalogBaseUrl: "https://catalog.onlib.org/polaris/"
      });

      assert.equal(result.status, testCase.expectedStatus);
      assert.equal(result.libraryName, "Onondaga County Public Library System");

      if (testCase.expectedStatus === "error") {
        assert.match(result.detail, /returned 500/i);
        return;
      }

      assert.ok(requests.length >= 1, `${testCase.id} should issue at least one catalog request`);
      assert.match(result.actionUrl, /^https:\/\/catalog\.onlib\.org\/polaris\//);

      if (Array.isArray(testCase.expectedFormatBuckets)) {
        assert.ok(Array.isArray(result.formats), `${testCase.id} should include formats`);
        assert.equal(result.formats.length, testCase.expectedFormatBuckets.length);
        const buckets = result.formats.map((row) => row.bucket);
        for (let i = 0; i < buckets.length; i++) {
          assert.equal(buckets[i], testCase.expectedFormatBuckets[i]);
        }
      }
    });
  }

  await run("traceability registry covers all page integration tests", async () => {
    for (const testCase of pageCases.values()) {
      assertTraceability({ stories, testCase });
    }
  });

  await run("TC-US1-GOODREADS-RENDER renders a Goodreads availability card", async () => {
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

  await run("TC-US2-AMAZON-RENDER renders an Amazon availability card", async () => {
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

  await run("TC-US4-CTA-LINK points to the OCPL catalog", async () => {
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

  await run("TC-US6-INCOMPLETE-METADATA degrades safely with missing author and ISBN", async () => {
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

  await run("TC-US7-PAGE-RENDER lists per-format availability on the card", async () => {
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
  });
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
