"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const archiver = require("archiver");

const root = path.join(__dirname, "..");

function readManifestVersion() {
  const manifestPath = path.join(root, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.version || typeof manifest.version !== "string") {
    throw new Error("manifest.json must include a string \"version\" field.");
  }
  return manifest.version;
}

function assertPackInputsExist() {
  const required = [
    path.join(root, "manifest.json"),
    path.join(root, "src"),
    path.join(root, "icons")
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      throw new Error(`Missing required path for store pack: ${path.relative(root, p)}`);
    }
  }
}

async function writeZip(outPath) {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    archive.file(path.join(root, "manifest.json"), { name: "manifest.json" });
    archive.directory(path.join(root, "src"), "src");
    archive.directory(path.join(root, "icons"), "icons");

    void archive.finalize();
  });
}

async function main() {
  execSync("npm test", { cwd: root, stdio: "inherit" });
  assertPackInputsExist();
  const version = readManifestVersion();
  const outName = `library-browser-plugin-v${version}.zip`;
  const outPath = path.join(root, "dist", outName);
  await writeZip(outPath);
  // Stable name for CI and scripts that expect a fixed path.
  const stablePath = path.join(root, "dist", "library-browser-plugin.zip");
  await fs.promises.copyFile(outPath, stablePath);
  console.log(`Packed ${outName} and library-browser-plugin.zip -> ${path.relative(root, outPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
