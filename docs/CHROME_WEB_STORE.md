# Chrome Web Store — build, first publish, API, CI, Edge

This repo ships a **Manifest V3** extension. The store package is a ZIP of **`manifest.json`**, **`src/`**, and **`icons/`** only (see `npm run pack`).

## 1. Build the upload ZIP

```bash
npm install
npm run pack
```

This runs **`npm test` first**, then writes:

- `dist/library-browser-plugin-v{version}.zip` — versioned artifact
- `dist/library-browser-plugin.zip` — stable name used by GitHub Actions

Upload either file to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## 2. Privacy policy URL (listing requirement)

Commit [privacy-policy.md](privacy-policy.md) on your default branch and paste a **stable public HTTPS URL** into the store listing (Privacy practices). The Chrome Web Store accepts policy links that point at GitHub.

**GitHub (typical):** use the rendered Markdown view for readability:

`https://github.com/<user-or-org>/<repo>/blob/<default-branch>/docs/privacy-policy.md`

Replace `<user-or-org>`, `<repo>`, and `<default-branch>` (often `main`) with your repository details.

Optional: set **`homepage_url`** in `manifest.json` to the same URL so the store and browser can link to it.

## 3. First-time dashboard upload (manual)

You complete this once per extension to create the item and obtain the **extension ID**.

1. Pay the [developer signup fee](https://developer.chrome.com/docs/webstore/register) if you have not already.
2. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), **Add new item** and upload `dist/library-browser-plugin.zip`.
3. Fill in listing text, screenshots, category, and **privacy** disclosures to match [privacy-policy.md](privacy-policy.md).
4. Copy the **extension ID** from the item page (32-character string). You need it for API/CI uploads.

Subsequent updates can reuse **Upload new package** in the dashboard, or use the Publish API / GitHub Action below.

## 4. Chrome Web Store Publish API (optional automation)

Programmatic upload uses Google’s **Chrome Web Store API**. Official guide: [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish).

Summary:

1. Create a **Google Cloud** project; enable **Chrome Web Store API**.
2. Configure **OAuth consent** and create **OAuth client** credentials suitable for the OAuth flow that produces a **refresh token** (Google’s docs describe the desktop/installed-app style flow used by upload tools).
3. Store **client ID**, **client secret**, **refresh token**, and the **extension item ID** only in secret storage (never commit them).

Local CLI option (after credentials exist): community tools such as `chrome-webstore-upload-cli` can upload the same ZIP; the GitHub Action in this repo wraps the same API.

## 5. GitHub Actions

Workflow: [.github/workflows/chrome-webstore.yml](../.github/workflows/chrome-webstore.yml).

**Triggers**

- **`workflow_dispatch`** — run from the Actions tab; choose whether to upload and whether to publish.
- **`push` of tags `v*`** — e.g. `v0.1.1` — packs, uploads, and **publishes** by default (submits the new package for review).

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `CHROME_EXTENSION_ID` | Item ID from the Developer Dashboard |
| `CHROME_CLIENT_ID` | OAuth client ID |
| `CHROME_CLIENT_SECRET` | OAuth client secret |
| `CHROME_REFRESH_TOKEN` | OAuth refresh token |

If secrets are missing, the upload step fails; the **pack** and **artifact** steps still validate the build.

**Review:** Publishing (manually or via API) still goes through Google’s review; automation does not bypass policy checks.

## 6. Microsoft Edge (optional)

The same ZIP works in Edge. Options:

- In Edge, open `edge://extensions`, enable **Allow extensions from other stores**, then install from the **Chrome Web Store** listing; or
- Submit the same package to **Microsoft Edge Add-ons** ([Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)) if you want a native Edge listing.
