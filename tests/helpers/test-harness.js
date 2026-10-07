const assert = require("node:assert/strict");
const { loadScripts } = require("./load-extension");
const { createDocumentFromHtml } = require("./fake-dom");

const SHARED_SCRIPTS = [
  "src/shared/namespace.js",
  "src/shared/normalize.js",
  "src/shared/book-metadata.js",
  "src/shared/catalog-cache.js"
];

function createConnectorHarness({ fetchImpl }) {
  const context = loadScripts(
    [...SHARED_SCRIPTS, "src/connectors/ocpl-polaris-connector.js"],
    {
      fetch: fetchImpl
    }
  );

  context.LibraryBrowser.catalogCache.clearMemoryForTests();

  return {
    context,
    connector: context.LibraryBrowser.ocplPolarisConnector,
    catalogCache: context.LibraryBrowser.catalogCache,
    toBookMetadata: context.LibraryBrowser.bookMetadata.toBookMetadata
  };
}

function createChromeMock({ sentMessages, storageValues, runtimeResults }) {
  const resultsQueue = Array.isArray(runtimeResults) ? runtimeResults.slice() : null;

  return {
    storage: {
      sync: {
        get() {
          return Promise.resolve({ ...storageValues });
        },
        set() {
          return Promise.resolve();
        }
      },
      local: {
        get() {
          return Promise.resolve({});
        },
        set() {
          return Promise.resolve();
        }
      }
    },
    runtime: {
      getManifest() {
        return { version: "0.4.0" };
      },
      sendMessage(message) {
        sentMessages.push(message);
        if (resultsQueue && resultsQueue.length) {
          return Promise.resolve(resultsQueue.shift());
        }
        if (typeof runtimeResults === "function") {
          return Promise.resolve(runtimeResults(message));
        }
        return Promise.resolve(runtimeResults);
      }
    },
    permissions: {
      contains() {
        return Promise.resolve(true);
      }
    }
  };
}

function createPageHarness({ html, url, runtimeResult, runtimeResults, storage }) {
  const document = createDocumentFromHtml(html);
  const sentMessages = [];
  const storageValues = { showMetadataDebug: false, ...(storage || {}) };
  const location = new URL(url);

  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.elements = [];
    }
    observe(element) {
      this.elements.push(element);
      this.callback([{ isIntersecting: true, target: element }], this);
    }
    unobserve() {}
    disconnect() {}
  }

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {}
  }

  const history = {
    pushState() {},
    replaceState() {}
  };

  loadScripts(
    [
      ...SHARED_SCRIPTS.filter((path) => !path.endsWith("catalog-cache.js")),
      "src/site-adapters/goodreads.js",
      "src/site-adapters/amazon.js",
      "src/content.js"
    ],
    {
      document,
      location,
      window: {
        location,
        getComputedStyle() {
          return { position: "static" };
        },
        addEventListener() {},
        innerWidth: 1200,
        innerHeight: 800
      },
      history,
      IntersectionObserver: FakeIntersectionObserver,
      MutationObserver: FakeMutationObserver,
      navigator: {
        clipboard: {
          writeText() {
            return Promise.resolve();
          }
        }
      },
      chrome: createChromeMock({
        sentMessages,
        storageValues,
        runtimeResults: runtimeResults || runtimeResult
      })
    }
  );

  return {
    document,
    sentMessages,
    async flush() {
      for (let i = 0; i < 10; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    getCard() {
      return document.getElementById("library-browser-card");
    },
    getBadges() {
      return document.querySelectorAll(".library-browser-badge");
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
