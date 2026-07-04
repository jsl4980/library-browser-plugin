(function registerOptionsPage(globalScope) {
  const root = globalScope || self;
  const app = root.LibraryBrowser;
  const form = document.getElementById("settings-form");
  const statusNode = document.getElementById("status");
  const libraryNameInput = document.getElementById("libraryName");
  const catalogBaseUrlInput = document.getElementById("catalogBaseUrl");
  const showMetadataDebugInput = document.getElementById("showMetadataDebug");

  async function loadSettings() {
    const settings = await chrome.storage.sync.get({
      libraryName: "Onondaga County Public Library System",
      catalogBaseUrl: "https://catalog.onlib.org/polaris/",
      showMetadataDebug: false
    });

    libraryNameInput.value = settings.libraryName;
    catalogBaseUrlInput.value = settings.catalogBaseUrl;
    showMetadataDebugInput.checked = Boolean(settings.showMetadataDebug);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const libraryName = app.normalize.normalizeWhitespace(libraryNameInput.value);
    const catalogBaseUrl = app.normalize.normalizeWhitespace(catalogBaseUrlInput.value);

    if (!libraryName || !catalogBaseUrl) {
      statusNode.textContent = "Add both a library name and a catalog base URL.";
      return;
    }

    let originPattern = "";
    try {
      originPattern = new URL(catalogBaseUrl).origin + "/*";
    } catch (error) {
      statusNode.textContent = "The catalog base URL must be a valid URL.";
      return;
    }

    const granted = await chrome.permissions.request({ origins: [originPattern] });

    if (!granted) {
      statusNode.textContent = "Permission to query your library catalog was denied.";
      return;
    }

    await chrome.storage.sync.set({
      libraryName,
      catalogBaseUrl
    });

    statusNode.textContent = "Saved. Refresh a Goodreads or Amazon page to try OCPL lookup.";
  }

  form.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });

  showMetadataDebugInput.addEventListener("change", () => {
    void chrome.storage.sync.set({ showMetadataDebug: showMetadataDebugInput.checked });
  });

  const exportButton = document.getElementById("export-support-report");
  if (exportButton) {
    exportButton.addEventListener("click", () => {
      void (async () => {
        try {
          const report = await chrome.runtime.sendMessage({ type: "getSupportReport" });
          const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          anchor.href = url;
          anchor.download = `library-browser-support-${stamp}.json`;
          anchor.click();
          URL.revokeObjectURL(url);
          statusNode.textContent = "Support report downloaded.";
        } catch (error) {
          statusNode.textContent =
            error instanceof Error ? error.message : "Could not export support report.";
        }
      })();
    });
  }

  void loadSettings();
})(typeof globalThis !== "undefined" ? globalThis : self);
