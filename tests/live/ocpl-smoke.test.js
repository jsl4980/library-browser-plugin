const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTraceability } = require("../helpers/fixture-loader");
const { createConnectorHarness, assertTraceability } = require("../helpers/test-harness");

const { stories, testCases } = loadTraceability();
const liveCases = new Map(testCases.filter((testCase) => testCase.source === "live").map((testCase) => [testCase.id, testCase]));
const harness = createConnectorHarness({ fetchImpl: fetch });

const liveBooks = {
  "TC-LIVE-US3-ISBN-KNOWN-BOOK": harness.toBookMetadata({
    title: "The Martian",
    author: "Andy Weir",
    isbn13: "9780553418026",
    isbn10: "0553418025",
    sourceSite: "goodreads",
    sourceUrl: "https://www.goodreads.com/book/show/18007564-the-martian"
  }),
  "TC-LIVE-US5-STATUS-KNOWN-BOOK": harness.toBookMetadata({
    title: "The Martian",
    author: "Andy Weir",
    isbn13: "",
    isbn10: "",
    sourceSite: "amazon",
    sourceUrl: "https://www.amazon.com/dp/0553418025"
  }),
  "TC-LIVE-US4-ACTION-URL": harness.toBookMetadata({
    title: "Project Hail Mary",
    author: "Andy Weir",
    isbn13: "9780593135204",
    isbn10: "0593135202",
    sourceSite: "goodreads",
    sourceUrl: "https://www.goodreads.com/book/show/54493401-project-hail-mary"
  }),
  "TC-LIVE-US6-DRIFT-DETECTION": harness.toBookMetadata({
    title: "Circe",
    author: "Madeline Miller",
    isbn13: "9780316556347",
    isbn10: "0316556343",
    sourceSite: "amazon",
    sourceUrl: "https://www.amazon.com/dp/0316556343"
  })
};

for (const [id, book] of Object.entries(liveBooks)) {
  test(id, async () => {
    const testCase = liveCases.get(id);
    assertTraceability({ stories, testCase });

    const result = await harness.connector.lookup(book, {
      libraryName: "Onondaga County Public Library System",
      catalogBaseUrl: "https://catalog.onlib.org/polaris/"
    });

    assert.ok(
      testCase.expectedStatuses.includes(result.status),
      `${id} returned unexpected status ${result.status}`
    );

    if (result.actionUrl) {
      assert.match(result.actionUrl, /^https:\/\/catalog\.onlib\.org\/polaris\//);
    }

    if (id === "TC-LIVE-US6-DRIFT-DETECTION" && result.status === "error") {
      assert.match(result.detail, /returned|lookup/i);
    }
  });
}
