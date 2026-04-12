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

    statusNode.textContent = "Saved. Refresh an Amazon or Goodreads book page to try OCPL lookup.";
  }

  form.addEventListener("submit", (event) => {
    void handleSubmit(event);
  });

  showMetadataDebugInput.addEventListener("change", () => {
    void chrome.storage.sync.set({ showMetadataDebug: showMetadataDebugInput.checked });
  });

  void loadSettings();
})(typeof globalThis !== "undefined" ? globalThis : self);
