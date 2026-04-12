const assert = require("node:assert/strict");
const { loadScripts } = require("./load-extension");
const { createDocumentFromHtml } = require("./fake-dom");

const SHARED_SCRIPTS = [
  "src/shared/namespace.js",
  "src/shared/normalize.js",
  "src/shared/book-metadata.js"
];

function createConnectorHarness({ fetchImpl }) {
  const context = loadScripts(
    [...SHARED_SCRIPTS, "src/connectors/ocpl-polaris-connector.js"],
    {
      fetch: fetchImpl
    }
  );

  return {
    context,
    connector: context.LibraryBrowser.ocplPolarisConnector,
    toBookMetadata: context.LibraryBrowser.bookMetadata.toBookMetadata
  };
}

function createPageHarness({ html, url, runtimeResult, storage }) {
  const document = createDocumentFromHtml(html);
  const sentMessages = [];
  const storageValues = { showMetadataDebug: false, ...(storage || {}) };

  loadScripts(
    [
      ...SHARED_SCRIPTS,
      "src/site-adapters/goodreads.js",
      "src/site-adapters/amazon.js",
      "src/content.js"
    ],
    {
      document,
      location: new URL(url),
      chrome: {
        storage: {
          sync: {
            get() {
              return Promise.resolve({ ...storageValues });
            }
          }
        },
        runtime: {
          sendMessage(message) {
            sentMessages.push(message);
            return Promise.resolve(runtimeResult);
          }
        }
      }
    }
  );

  return {
    document,
    sentMessages,
    getCard() {
      return document.getElementById("library-browser-card");
    }
  };
}

function assertTraceability({ stories, testCase }) {
  assert.ok(testCase.id, "Test case id is required");
  assert.ok(Array.isArray(testCase.stories) && testCase.stories.length > 0, `${testCase.id} must link to user stories`);
  for (const storyId of testCase.stories) {
    assert.ok(stories[storyId], `${testCase.id} references unknown story ${storyId}`);
  }
}

module.exports = {
  createConnectorHarness,
  createPageHarness,
  assertTraceability
};
