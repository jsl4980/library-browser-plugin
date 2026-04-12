const test = require("node:test");
const assert = require("node:assert/strict");
const { loadOcplFixtures, loadTraceability } = require("./helpers/fixture-loader");
const { createConnectorHarness, assertTraceability } = require("./helpers/test-harness");

const { stories, testCases } = loadTraceability();
const connectorCases = testCases.filter((testCase) => testCase.kind === "connector" && testCase.source === "fixture");
const fixtures = new Map(loadOcplFixtures().map((fixture) => [fixture.id, fixture]));

test("traceability registry covers all connector fixture tests", () => {
  for (const testCase of connectorCases) {
    assertTraceability({ stories, testCase });
    assert.ok(fixtures.has(testCase.fixtureId), `${testCase.id} is missing fixture ${testCase.fixtureId}`);
  }
});

for (const testCase of connectorCases) {
  test(`${testCase.id} -> ${testCase.expectedStatus}`, async () => {
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

    if (testCase.expectedStatus === "available_now") {
      assert.match(result.summary, /available now/i);
    }

    if (testCase.expectedStatus === "hold_available") {
      assert.match(result.detail, /hold|copy details/i);
    }

    if (testCase.expectedStatus === "not_found") {
      assert.match(result.summary, /not found/i);
    }

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
