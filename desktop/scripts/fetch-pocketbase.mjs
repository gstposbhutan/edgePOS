#!/usr/bin/env node
// Fetch the pinned PocketBase server binary for a target platform into ./pb.
//
// The binary is platform-specific and ~30 MB, so it is NOT committed — run this before
// packaging (the electron:build scripts do). Pinned to the version that ships with the
// committed pb/CHANGELOG.md.
//
//   node scripts/fetch-pocketbase.mjs                    # host platform/arch
//   node scripts/fetch-pocketbase.mjs --platform win32   # cross-fetch the Windows binary
//   node scripts/fetch-pocketbase.mjs --force            # re-download even if present
import { mkdir, chmod, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

const VERSION = "0.37.3"; // keep in sync with pb/CHANGELOG.md + the committed Linux binary

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PB_DIR = path.join(__dirname, "..", "pb");

const args = process.argv.slice(2);
const getArg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const force = args.includes("--force");

const platform = getArg("--platform") || process.platform; // win32 | linux | darwin
const arch = getArg("--arch") || process.arch;             // x64 | arm64

const osMap = { win32: "windows", linux: "linux", darwin: "darwin" };
const archMap = { x64: "amd64", arm64: "arm64" };
const os = osMap[platform];
const goarch = archMap[arch];
if (!os || !goarch) {
  console.error(`Unsupported platform/arch: ${platform}/${arch}`);
  process.exit(1);
}

const isWin = platform === "win32";
const outName = isWin ? "pocketbase.exe" : "pocketbase";
const outPath = path.join(PB_DIR, outName);

if (existsSync(outPath) && !force) {
  console.log(`✓ pb/${outName} already present (use --force to re-download)`);
  process.exit(0);
}

const zipName = `pocketbase_${VERSION}_${os}_${goarch}.zip`;
const url = `https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/${zipName}`;

console.log(`↓ ${url}`);
const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());

const zip = new AdmZip(buf);
const entry = zip.getEntries().find((e) => e.entryName === outName || e.entryName.endsWith("/" + outName));
if (!entry) {
  console.error(`${outName} not found inside ${zipName}`);
  process.exit(1);
}

await mkdir(PB_DIR, { recursive: true });
const data = entry.getData();
await writeFile(outPath, data);
if (!isWin) await chmod(outPath, 0o755);
console.log(`✓ pb/${outName} written (${(data.length / 1e6).toFixed(1)} MB) — PocketBase v${VERSION} ${os}/${goarch}`);
