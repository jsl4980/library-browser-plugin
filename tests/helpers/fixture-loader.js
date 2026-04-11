const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(ROOT, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function loadTraceability() {
  return {
    stories: readJson("tests/traceability/user-stories.json"),
    testCases: readJson("tests/traceability/test-cases.json").testCases
  };
}

function loadOcplFixtures() {
  const manifest = readJson("tests/fixtures/ocpl/manifest.json");
  return manifest.fixtures.map((fixture) => ({
    ...fixture,
    responseBody: readText(`tests/fixtures/ocpl/${fixture.responseFile}`)
  }));
}

function loadPageFixture(name) {
  return readText(`tests/fixtures/pages/${name}`);
}

module.exports = {
  PROJECT_ROOT,
  loadTraceability,
  loadOcplFixtures,
  loadPageFixture
};
