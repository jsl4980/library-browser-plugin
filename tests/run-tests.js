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
  const connectorCases = testCases.filter(
    (testCase) =>
      testCase.kind === "connector" &&
      testCase.source === "fixture" &&
      !testCase.id.startsWith("TC-US10-")
  );
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
      const result = await harness.connector.lookup(
        book,
        {
          libraryName: "Onondaga County Public Library System",
          catalogBaseUrl: "https://catalog.onlib.org/polaris/"
        },
        testCase.includeDebug ? { includeDebug: true } : undefined
      );

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

      if (testCase.includeDebug) {
        assert.ok(result.debug, `${testCase.id} should attach debug metadata`);
        assert.equal(result.debug.source.title, fixture.book.title);
        assert.ok(Array.isArray(result.debug.catalog.lookupUrlsOrdered));
        assert.ok(Array.isArray(result.debug.catalog.tries));
        assert.ok(result.debug.catalog.winningUrl);
        assert.equal(typeof result.debug.catalog.winningIndex, "number");
      } else {
        assert.equal(result.debug, undefined, `${testCase.id} should omit debug unless requested`);
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

    await harness.flush();
    const card = harness.getCard();

    assertTraceability({ stories, testCase });
    assert.ok(card, "Expected a library card to be inserted");
    assert.equal(card.dataset.status, testCase.expectedStatus);
    assert.equal(harness.sentMessages[0].book.title, "The Testable Library");
    assert.equal(harness.sentMessages[0].book.author, "Ada Example");
    assert.equal(harness.sentMessages[0].book.isbn13, "9781234567897");
  });

  await run("TC-US1-GOODREADS-SUBTITLE-TITLE strips retailer subtitle before lookup", async () => {
    const testCase = pageCases.get("TC-US1-GOODREADS-SUBTITLE-TITLE");
    const harness = createPageHarness({
      html: loadPageFixture("goodreads-book-subtitle.html"),
      url: "https://www.goodreads.com/book/show/40121378-atomic-habits",
      runtimeResult: {
        status: "available_now",
        summary: "Available now at OCPL",
        detail: "The catalog page indicates at least one available copy.",
        actionUrl: "https://catalog.onlib.org/polaris/view.aspx?isbn=9780735211309",
        libraryName: "Onondaga County Public Library System"
      }
    });

    await harness.flush();
    const card = harness.getCard();

    assertTraceability({ stories, testCase });
    assert.ok(card, "Expected a library card to be inserted");
    assert.equal(card.dataset.status, testCase.expectedStatus);
    assert.equal(harness.sentMessages[0].book.title, "Atomic Habits");
    assert.equal(harness.sentMessages[0].book.author, "James Clear");
    assert.equal(harness.sentMessages[0].book.isbn13, "9780735211309");
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

    await harness.flush();
    const card = harness.getCard();

    assertTraceability({ stories, testCase });
    assert.ok(card, "Expected a library card to be inserted");
    assert.equal(card.dataset.status, testCase.expectedStatus);
    assert.equal(harness.sentMessages[0].book.title, "Waiting for Circulation");
    assert.equal(harness.sentMessages[0].book.author, "Nina Queue");
    assert.equal(harness.sentMessages[0].book.isbn13, "9781111111111");
  });

  await run("TC-US2-AMAZON-SUBTITLE-TITLE strips retailer subtitle before lookup", async () => {
    const testCase = pageCases.get("TC-US2-AMAZON-SUBTITLE-TITLE");
    const harness = createPageHarness({
      html: loadPageFixture("amazon-book-subtitle.html"),
      url: "https://www.amazon.com/gp/product/B07D23CFGR",
      runtimeResult: {
        status: "hold_available",
        summary: "Found at OCPL",
        detail: "The book appears in the catalog and may require a hold or sign-in for copy details.",
        actionUrl: "https://catalog.onlib.org/polaris/view.aspx?isbn=0735211308",
        libraryName: "Onondaga County Public Library System"
      }
    });

    await harness.flush();
    const card = harness.getCard();

    assertTraceability({ stories, testCase });
    assert.ok(card, "Expected a library card to be inserted");
    assert.equal(card.dataset.status, testCase.expectedStatus);
    assert.equal(harness.sentMessages[0].book.title, "Atomic Habits");
    assert.equal(harness.sentMessages[0].book.author, "James Clear");
    assert.equal(harness.sentMessages[0].book.isbn10, "0735211308");
    assert.equal(harness.sentMessages[0].book.isbn13, "");
  });

  await run("TC-US2-AMAZON-LEGACY-ASIN-URL renders on legacy Amazon ASIN URLs", async () => {
    const testCase = pageCases.get("TC-US2-AMAZON-LEGACY-ASIN-URL");
    const harness = createPageHarness({
      html: loadPageFixture("amazon-book.html"),
      url: "https://www.amazon.com/exec/obidos/ASIN/0201657880",
      runtimeResult: {
        status: "hold_available",
        summary: "Found at OCPL",
        detail: "The book appears in the catalog and may require a hold or sign-in for copy details.",
        actionUrl: "https://catalog.onlib.org/polaris/view.aspx?isbn=9781111111111",
        libraryName: "Onondaga County Public Library System"
      }
    });

    await harness.flush();
    const card = harness.getCard();

    assertTraceability({ stories, testCase });
    assert.ok(card, "Expected a library card to be inserted");
    assert.equal(card.dataset.status, testCase.expectedStatus);
    assert.equal(harness.sentMessages[0].book.title, "Waiting for Circulation");
    assert.equal(harness.sentMessages[0].book.sourceUrl, "https://www.amazon.com/exec/obidos/ASIN/0201657880");
  });

  await run("TC-US2-AMAZON-KINDLE-BOOK detects Amazon Kindle books without ISBN", async () => {
    const testCase = pageCases.get("TC-US2-AMAZON-KINDLE-BOOK");
    const harness = createPageHarness({
      html: loadPageFixture("amazon-kindle-book.html"),
      url: "https://www.amazon.com/dp/kindlebook",
      runtimeResult: {
        status: "found",
        summary: "Found at OCPL",
        detail: "The book appears in the OCPL catalog.",
        actionUrl: "https://catalog.onlib.org/polaris/view.aspx?keyword=Digital%20Circulation%20Morgan%20Reader",
        libraryName: "Onondaga County Public Library System"
      }
    });

    await harness.flush();
    const card = harness.getCard();

    assertTraceability({ stories, testCase });
    assert.ok(card, "Expected a library card to be inserted");
    assert.equal(card.dataset.status, testCase.expectedStatus);
    assert.equal(harness.sentMessages[0].book.title, "Digital Circulation");
    assert.equal(harness.sentMessages[0].book.author, "Morgan Reader");
    assert.equal(harness.sentMessages[0].book.isbn13, "");
  });

  await run("TC-US2-AMAZON-NON-BOOK-SKIP skips Amazon products without book evidence", async () => {
    const testCase = pageCases.get("TC-US2-AMAZON-NON-BOOK-SKIP");
    const harness = createPageHarness({
      html: loadPageFixture("amazon-non-book.html"),
      url: "https://www.amazon.com/dp/nonbook",
      runtimeResult: {
        status: "found",
        summary: "Unexpected lookup",
        detail: "This result should not be rendered.",
        actionUrl: "https://catalog.onlib.org/polaris/view.aspx?keyword=Everyday%20Stainless%20Water%20Bottle",
        libraryName: "Onondaga County Public Library System"
      }
    });

    await harness.flush();

    assertTraceability({ stories, testCase });
    assert.equal(harness.getCard(), null);
    assert.equal(harness.sentMessages.length, 0);
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

    await harness.flush();
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

    await harness.flush();
    const card = harness.getCard();

    assertTraceability({ stories, testCase });
    assert.ok(card, "Expected a library card even with incomplete metadata");
    assert.equal(card.dataset.status, testCase.expectedStatus);
    assert.equal(harness.sentMessages[0].book.title, "Mystery Without Identifier");
    assert.equal(harness.sentMessages[0].book.author, "");
    assert.equal(harness.sentMessages[0].book.isbn13, "");
  });

  await run("TC-US3-EXACT-RELATED-SECTIONS renders exact and related blocks with distinct catalog links", async () => {
    const testCase = pageCases.get("TC-US3-EXACT-RELATED-SECTIONS");
    const isbnUrl = "https://catalog.onlib.org/polaris/view.aspx?isbn=9781234567897";
    const keywordUrl =
      "https://catalog.onlib.org/polaris/view.aspx?keyword=The%20Testable%20Library%20Ada%20Example";
    const formatsExact = [
      { bucket: "physical_book", label: "Book", availability: "available_now", hint: "Available now" },
      { bucket: "ebook", label: "E-book", availability: "hold_available", hint: "Hold or request" }
    ];
    const formatsRelated = [
      { bucket: "physical_book", label: "Book", availability: "hold_available", hint: "Place hold" }
    ];

    const harness = createPageHarness({
      html: loadPageFixture("goodreads-book.html"),
      url: "https://www.goodreads.com/book/show/1-the-testable-library",
      runtimeResult: {
        status: "available_now",
        summary: "Available now at OCPL",
        detail: "Print book: Available now E-book: Hold or request",
        actionUrl: isbnUrl,
        libraryName: "Onondaga County Public Library System",
        formats: formatsExact,
        exactMatch: {
          status: "available_now",
          summary: "Available now at OCPL",
          detail: "Print book: Available now E-book: Hold or request",
          actionUrl: isbnUrl,
          libraryName: "Onondaga County Public Library System",
          formats: formatsExact
        },
        relatedMatch: {
          status: "hold_available",
          summary: "Found at OCPL",
          detail: "Other editions may be available.",
          actionUrl: keywordUrl,
          libraryName: "Onondaga County Public Library System",
          formats: formatsRelated,
          relatedUsedAuthor: true
        }
      }
    });

    await harness.flush();
    const card = harness.getCard();
    const exactWrap = card.querySelector(".library-browser-card__match--exact");
    const relatedWrap = card.querySelector(".library-browser-card__match--related");
    const exactAction = exactWrap.querySelector(".library-browser-card__action--exact");
    const relatedAction = relatedWrap.querySelector(".library-browser-card__action--related");
    const exactFormats = exactWrap.querySelectorAll(".library-browser-card__format");
    const relatedFormats = relatedWrap.querySelectorAll(".library-browser-card__format");

    assertTraceability({ stories, testCase });
    assert.equal(card.dataset.status, testCase.expectedStatus);
    assert.equal(exactWrap.hidden, false);
    assert.equal(relatedWrap.hidden, false);
    assert.equal(exactAction.textContent, "View exact match in catalog");
    assert.equal(relatedAction.textContent, "View title & author search in catalog");
    assert.equal(exactFormats.length, 2);
    assert.equal(relatedFormats.length, 1);
    assert.match(exactFormats[0].textContent, /Print book/);
    assert.match(relatedFormats[0].textContent, /Print book/);
  });

  await run("TC-US3-RELATED-SECTION-ONLY shows related heading and link when there is no ISBN block", async () => {
    const testCase = pageCases.get("TC-US3-RELATED-SECTION-ONLY");
    const keywordUrl =
      "https://catalog.onlib.org/polaris/view.aspx?keyword=Fallback%20Catalog%20Search%20Taylor%20Query";
    const harness = createPageHarness({
      html: loadPageFixture("goodreads-book.html"),
      url: "https://www.goodreads.com/book/show/1-the-testable-library",
      runtimeResult: {
        status: "found",
        summary: "Found at OCPL",
        detail: "The book appears in the OCPL catalog.",
        actionUrl: keywordUrl,
        libraryName: "Onondaga County Public Library System",
        relatedMatch: {
          status: "found",
          summary: "Found at OCPL",
          detail: "The book appears in the OCPL catalog.",
          actionUrl: keywordUrl,
          libraryName: "Onondaga County Public Library System",
          relatedUsedAuthor: true
        }
      }
    });

    await harness.flush();
    const card = harness.getCard();
    const exactWrap = card.querySelector(".library-browser-card__match--exact");
    const relatedWrap = card.querySelector(".library-browser-card__match--related");
    const relatedAction = relatedWrap.querySelector(".library-browser-card__action--related");

    assertTraceability({ stories, testCase });
    assert.equal(card.dataset.status, testCase.expectedStatus);
    assert.equal(exactWrap.hidden, true);
    assert.equal(relatedWrap.hidden, false);
    assert.equal(relatedAction.textContent, "View title & author search in catalog");
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

    await harness.flush();
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

  await run("TC-US8-PAGE-DEBUG shows expandable metadata when testing option is enabled", async () => {
    const testCase = pageCases.get("TC-US8-PAGE-DEBUG");
    const catalogUrl = "https://catalog.onlib.org/polaris/view.aspx?isbn=9781234567897";
    const debug = {
      source: {
        title: "The Testable Library",
        author: "Ada Example",
        isbn13: "9781234567897",
        isbn10: "1234567890",
        normalizedTitle: "the testable library",
        normalizedAuthor: "ada example",
        sourceSite: "goodreads",
        sourceUrl: "https://www.goodreads.com/book/show/1-the-testable-library"
      },
      catalog: {
        lookupUrlsOrdered: [catalogUrl],
        tries: [{ kind: "isbn", url: catalogUrl, matched: true }],
        winningUrl: catalogUrl,
        winningIndex: 0
      }
    };

    const harness = createPageHarness({
      html: loadPageFixture("goodreads-book.html"),
      url: "https://www.goodreads.com/book/show/1-the-testable-library",
      storage: { showMetadataDebug: true },
      runtimeResult: {
        status: "available_now",
        summary: "Available now at OCPL",
        detail: "The catalog page indicates at least one available copy.",
        actionUrl: catalogUrl,
        libraryName: "Onondaga County Public Library System",
        debug
      }
    });

    await harness.flush();
    const card = harness.getCard();
    const debugBody = card.querySelector(".library-browser-card__debug-body");

    assertTraceability({ stories, testCase });
    assert.ok(card, "Expected a library card to be inserted");
    assert.equal(harness.sentMessages[0].includeDebug, true);
    assert.equal(card.querySelector(".library-browser-card__debug").hidden, false);
    assert.match(debugBody.textContent, /lookupUrlsOrdered/);
    assert.match(debugBody.textContent, /The Testable Library/);
  });

  await run("TC-US9-GOODREADS-LIST-BADGES renders status badges for list rows", async () => {
    const testCase = pageCases.get("TC-US9-GOODREADS-LIST-BADGES");
    const resultsByTitle = {
      "Available Book": {
        status: "available_now",
        summary: "Available now at OCPL",
        detail: "Available",
        actionUrl: "https://catalog.onlib.org/polaris/view.aspx?keyword=Available%20Book",
        libraryName: "Onondaga County Public Library System"
      },
      "Hold Book": {
        status: "hold_available",
        summary: "Found at OCPL",
        detail: "Hold",
        actionUrl: "https://catalog.onlib.org/polaris/view.aspx?keyword=Hold%20Book",
        libraryName: "Onondaga County Public Library System"
      },
      "Missing Book": {
        status: "not_found",
        summary: "Not found at OCPL",
        detail: "Missing",
        actionUrl: "https://catalog.onlib.org/polaris/view.aspx?keyword=Missing%20Book",
        libraryName: "Onondaga County Public Library System"
      }
    };

    const harness = createPageHarness({
      html: loadPageFixture("goodreads-list.html"),
      url: "https://www.goodreads.com/list/show/1.Best_Books_Ever",
      runtimeResults(message) {
        return resultsByTitle[message.book.title] || resultsByTitle["Missing Book"];
      }
    });

    await harness.flush();
    const badges = harness.getBadges();

    assertTraceability({ stories, testCase });
    assert.equal(badges.length, 3);
    assert.equal(harness.sentMessages.length, 3);
    assert.ok(harness.sentMessages.every((message) => message.mode === "list"));
    assert.ok(harness.sentMessages.every((message) => !message.book.isbn13));
    assert.equal(badges.filter((badge) => badge.dataset.tone === "available").length, 1);
    assert.equal(badges.filter((badge) => badge.dataset.tone === "catalog").length, 1);
    assert.equal(badges.filter((badge) => badge.dataset.tone === "missing").length, 1);

    const availableBadge = badges.find((badge) => badge.dataset.tone === "available");
    availableBadge.dispatchEvent({
      type: "click",
      preventDefault() {},
      stopPropagation() {}
    });
    await harness.flush();
    const popup = harness.document.getElementById("library-browser-popup");
    assert.ok(popup, "Expected popup after badge click");
    assert.match(popup.textContent, /Available now at OCPL/);
  });

  await run("TC-US9-GOODREADS-GRID-BADGES renders grid badges including errors", async () => {
    const testCase = pageCases.get("TC-US9-GOODREADS-GRID-BADGES");
    const harness = createPageHarness({
      html: loadPageFixture("goodreads-grid.html"),
      url: "https://www.goodreads.com/review/list/1",
      runtimeResults(message) {
        if (message.book.title === "Grid Available") {
          return {
            status: "available_now",
            summary: "Available now at OCPL",
            detail: "Available",
            actionUrl: "https://catalog.onlib.org/polaris/view.aspx?keyword=Grid%20Available",
            libraryName: "Onondaga County Public Library System"
          };
        }
        return {
          status: "error",
          summary: "Lookup failed",
          detail: "Catalog request failed. Enable debug or export a support report from settings.",
          actionUrl: "",
          libraryName: ""
        };
      }
    });

    await harness.flush();
    const badges = harness.getBadges();

    assertTraceability({ stories, testCase });
    assert.equal(badges.length, 2);
    assert.equal(badges.filter((badge) => badge.dataset.tone === "available").length, 1);
    assert.equal(badges.filter((badge) => badge.dataset.tone === "error").length, 1);
    assert.equal(harness.getCard(), null);
  });

  await run("TC-US10-KEYWORD-URL-CACHE reuses keyword catalog fetch for identical title/author", async () => {
    const testCase = testCases.find((entry) => entry.id === "TC-US10-KEYWORD-URL-CACHE");
    const fixture = fixtures.get(testCase.fixtureId);
    const requests = [];
    const harness = createConnectorHarness({
      fetchImpl: async (url) => {
        requests.push(url.toString());
        return {
          ok: true,
          status: 200,
          async text() {
            return fixture.responseBody;
          }
        };
      }
    });

    const book = harness.toBookMetadata(fixture.book);
    const settings = {
      libraryName: "Onondaga County Public Library System",
      catalogBaseUrl: "https://catalog.onlib.org/polaris/"
    };

    const first = await harness.connector.lookup(book, settings, { includeDebug: true });
    const second = await harness.connector.lookup(book, settings, { includeDebug: true });

    assertTraceability({ stories, testCase });
    assert.equal(first.status, testCase.expectedStatus);
    assert.equal(second.status, testCase.expectedStatus);
    assert.equal(requests.length, 1, "second lookup should reuse cached keyword page");
    assert.equal(first.debug.catalog.tries[0].cacheHit, false);
    assert.equal(second.debug.catalog.tries[0].cacheHit, true);
  });

  await run("TC-US10-NO-CROSS-STRATEGY-ALIAS does not serve ISBN result for title/author-only book", async () => {
    const testCase = testCases.find((entry) => entry.id === "TC-US10-NO-CROSS-STRATEGY-ALIAS");
    const fixture = fixtures.get(testCase.fixtureId);
    const requests = [];
    const harness = createConnectorHarness({
      fetchImpl: async (url) => {
        requests.push(url.toString());
        return {
          ok: true,
          status: 200,
          url: url.toString(),
          async text() {
            return fixture.responseBody;
          }
        };
      }
    });

    const settings = {
      libraryName: "Onondaga County Public Library System",
      catalogBaseUrl: "https://catalog.onlib.org/polaris/"
    };

    const isbnBook = harness.toBookMetadata(fixture.book);
    const titleOnlyBook = harness.toBookMetadata({
      title: fixture.book.title,
      author: fixture.book.author,
      isbn13: "",
      isbn10: "",
      sourceSite: "goodreads",
      sourceUrl: fixture.book.sourceUrl
    });

    await harness.connector.lookup(isbnBook, settings, { includeDebug: true });
    const titleResult = await harness.connector.lookup(titleOnlyBook, settings, { includeDebug: true });

    assertTraceability({ stories, testCase });
    assert.ok(titleResult.debug.catalog.tries.some((entry) => entry.kind === "related"));
    assert.ok(titleResult.debug.catalog.tries.every((entry) => entry.kind !== "isbn"));
    // Keyword URL may be a cache hit from the prior ISBN lookup's related leg — that is correct.
    assert.equal(titleResult.debug.catalog.tries.find((entry) => entry.kind === "related").cacheHit, true);
  });
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});

